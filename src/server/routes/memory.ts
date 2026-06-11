import { Hono } from "hono";
import type {
  MemoryDetailResponse,
  MemoryGraphResponse,
} from "../../../shared/api-types.js";
import {
  isSafeMemorySegment,
  readMemoryBody,
  scanMemories,
} from "../../core/memory.js";
import type { AppState } from "../state.js";

export function memoryRoutes(state: AppState): Hono {
  const app = new Hono();
  const scanOptions = () => ({ redact: state.config.redact });

  app.get("/", (c) => {
    const { graph, projects } = scanMemories(
      state.config.claudeDir,
      scanOptions(),
    );
    const response: MemoryGraphResponse = {
      memories: graph.nodes.map(({ outgoingSlugs: _, ...summary }) => summary),
      edges: graph.edges,
      danglingLinks: graph.danglingLinks,
      projects,
    };
    return c.json(response);
  });

  app.get("/:project/:file", (c) => {
    const projectDir = c.req.param("project");
    const fileName = c.req.param("file");
    if (!isSafeMemorySegment(projectDir) || !isSafeMemorySegment(fileName)) {
      return c.json({ error: "memory not found" }, 404);
    }
    const body = readMemoryBody(
      state.config.claudeDir,
      projectDir,
      fileName,
      scanOptions(),
    );
    if (body === null) return c.json({ error: "memory not found" }, 404);

    const { graph } = scanMemories(state.config.claudeDir, scanOptions());
    const id = `${projectDir}/${fileName}`;
    const node = graph.nodes.find((entry) => entry.id === id);
    if (!node) return c.json({ error: "memory not found" }, 404);

    const { outgoingSlugs, ...summary } = node;
    const response: MemoryDetailResponse = {
      ...summary,
      body,
      outgoing: outgoingSlugs.map((slug) => ({
        slug,
        targetId:
          graph.edges.find((edge) => edge.sourceId === id && edge.slug === slug)
            ?.targetId ?? null,
      })),
      backlinks: graph.edges
        .filter((edge) => edge.targetId === id)
        .map((edge) => {
          const source = graph.nodes.find(
            (entry) => entry.id === edge.sourceId,
          );
          return {
            sourceId: edge.sourceId,
            title: source?.title ?? edge.sourceId,
            projectDir: source?.projectDir ?? "",
          };
        }),
    };
    return c.json(response);
  });

  return app;
}
