import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  MessagesPageResponse,
  MetaResponse,
  ModelSummary,
  OverviewResponse,
  ProjectSummary,
  ScanStatusResponse,
  SessionDetailResponse,
  SessionsPageResponse,
  ToolsAnalyticsResponse,
  UsageBucket,
} from "../../../shared/api-types";
import { apiGet } from "./client";

export function useMeta() {
  return useQuery({
    queryKey: ["meta"],
    queryFn: () => apiGet<MetaResponse>("/api/meta"),
    staleTime: Infinity,
  });
}

/** Polls while a scan is running; invalidates all data when it completes. */
export function useScanStatus() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ["scan-status"],
    queryFn: async () => {
      const status = await apiGet<ScanStatusResponse>("/api/scan/status");
      const previous = queryClient.getQueryData<ScanStatusResponse>([
        "scan-status",
      ]);
      if (previous?.state === "scanning" && status.state === "idle") {
        queryClient.invalidateQueries({
          predicate: (q) => q.queryKey[0] !== "scan-status",
        });
      }
      return status;
    },
    refetchInterval: (query) =>
      query.state.data?.state === "scanning" ? 1000 : 10_000,
  });
}

export function useOverview() {
  return useQuery({
    queryKey: ["overview"],
    queryFn: () => apiGet<OverviewResponse>("/api/overview"),
  });
}

export function useSessions(params: {
  project?: string;
  q?: string;
  sort?: string;
  cursor?: number;
  limit?: number;
}) {
  const search = new URLSearchParams();
  if (params.project) search.set("project", params.project);
  if (params.q) search.set("q", params.q);
  if (params.sort) search.set("sort", params.sort);
  if (params.cursor) search.set("cursor", String(params.cursor));
  if (params.limit) search.set("limit", String(params.limit));
  const queryString = search.toString();
  return useQuery({
    queryKey: ["sessions", queryString],
    queryFn: () =>
      apiGet<SessionsPageResponse>(
        `/api/sessions${queryString ? `?${queryString}` : ""}`,
      ),
  });
}

export function useSessionDetail(sessionId: string | undefined) {
  return useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => apiGet<SessionDetailResponse>(`/api/sessions/${sessionId}`),
    enabled: Boolean(sessionId),
  });
}

export function useSessionMessages(sessionId: string | undefined, limit = 200) {
  return useInfiniteQuery({
    queryKey: ["session-messages", sessionId, limit],
    queryFn: ({ pageParam }) =>
      apiGet<MessagesPageResponse>(
        `/api/sessions/${sessionId}/messages?cursor=${pageParam}&limit=${limit}`,
      ),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: Boolean(sessionId),
  });
}

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => apiGet<ProjectSummary[]>("/api/projects"),
  });
}

export function useUsageAnalytics(groupBy: "day" | "project" | "model") {
  return useQuery({
    queryKey: ["analytics-usage", groupBy],
    queryFn: () =>
      apiGet<UsageBucket[]>(`/api/analytics/usage?groupBy=${groupBy}`),
  });
}

export function useToolsAnalytics() {
  return useQuery({
    queryKey: ["analytics-tools"],
    queryFn: () => apiGet<ToolsAnalyticsResponse>("/api/analytics/tools"),
  });
}

export function useModelAnalytics() {
  return useQuery({
    queryKey: ["analytics-models"],
    queryFn: () => apiGet<ModelSummary[]>("/api/analytics/models"),
  });
}
