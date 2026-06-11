import type { MemoryType } from "../../../../shared/api-types";

export const MEMORY_TYPE_COLORS: Record<MemoryType, string> = {
  project: "#6366f1", // indigo
  feedback: "#eab308", // amber
  reference: "#06b6d4", // cyan
  user: "#ec4899", // pink
  unknown: "#71717a", // zinc
};

export const MEMORY_TYPES: MemoryType[] = [
  "project",
  "feedback",
  "reference",
  "user",
  "unknown",
];
