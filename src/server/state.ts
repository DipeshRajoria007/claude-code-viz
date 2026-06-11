import { join } from "node:path";
import type {
  ScanStatusResponse,
  SessionSummary,
} from "../../shared/api-types.js";
import {
  createEmptyIndex,
  type IndexFile,
  loadIndex,
} from "../core/indexStore.js";
import { computeCostForUsageMap } from "../core/pricing.js";
import type { ModelPricing } from "../core/pricing-data.js";
import { allAggregates, scanClaudeDir } from "../core/scanner.js";
import type { SessionAggregate } from "../core/types.js";

export interface AppConfig {
  claudeDir: string;
  cacheDir: string;
  appVersion: string;
  redact: boolean;
  pricingTable?: ModelPricing[];
}

/**
 * Mutable server-side state: the loaded index plus the status of the
 * background scan that keeps it fresh.
 */
export class AppState {
  readonly config: AppConfig;
  private index: IndexFile;
  private scanPromise: Promise<void> | null = null;
  private status: ScanStatusResponse = {
    state: "idle",
    filesTotal: 0,
    filesDone: 0,
    errors: 0,
    startedAt: null,
    lastCompletedAt: null,
  };

  constructor(config: AppConfig) {
    this.config = config;
    this.index =
      loadIndex(config.cacheDir, config.claudeDir) ??
      createEmptyIndex(config.claudeDir, config.appVersion);
  }

  scanStatus(): ScanStatusResponse {
    return { ...this.status };
  }

  /** Kick off a background scan. Returns false if one is already running. */
  startScan(): boolean {
    if (this.scanPromise) return false;
    this.status = {
      ...this.status,
      state: "scanning",
      filesTotal: 0,
      filesDone: 0,
      errors: 0,
      startedAt: new Date().toISOString(),
    };
    this.scanPromise = scanClaudeDir({
      claudeDir: this.config.claudeDir,
      cacheDir: this.config.cacheDir,
      appVersion: this.config.appVersion,
      onProgress: (progress) => {
        this.status.filesTotal = progress.filesTotal;
        this.status.filesDone = progress.filesDone;
      },
    })
      .then((result) => {
        this.index = result.index;
        this.status.errors = result.errors;
      })
      .catch(() => {
        this.status.errors++;
      })
      .finally(() => {
        this.status.state = "idle";
        this.status.lastCompletedAt = new Date().toISOString();
        this.scanPromise = null;
      });
    return true;
  }

  /** Await the in-flight scan, if any (used by tests and shutdown). */
  async whenScanned(): Promise<void> {
    await this.scanPromise;
  }

  aggregates(): SessionAggregate[] {
    return allAggregates(this.index);
  }

  /** Find one session and its transcript path by session id. */
  findSession(
    sessionId: string,
  ): { agg: SessionAggregate; filePath: string } | null {
    for (const [relPath, entry] of Object.entries(this.index.files)) {
      if (entry.agg.sessionId === sessionId) {
        return {
          agg: entry.agg,
          filePath: join(this.config.claudeDir, relPath),
        };
      }
    }
    return null;
  }

  summarize(agg: SessionAggregate): SessionSummary {
    const cost = computeCostForUsageMap(
      agg.usageByModel,
      this.config.pricingTable,
    );
    const models = Object.keys(agg.usageByModel);
    const allUnpriced =
      models.length > 0 && cost.unpricedModels.length === models.length;
    return {
      sessionId: agg.sessionId,
      projectDir: agg.projectDir,
      cwd: agg.cwd,
      title: agg.title,
      firstTs: agg.firstTs,
      lastTs: agg.lastTs,
      messages: agg.counts.user + agg.counts.assistant,
      toolCalls: agg.counts.toolUse,
      models,
      costUsd: allUnpriced ? null : cost.usd,
    };
  }
}
