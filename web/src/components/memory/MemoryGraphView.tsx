import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { MemoryEdge, MemorySummary } from "../../../../shared/api-types";
import { projectLabel } from "../../lib/format";
import { memoryRoute } from "./MemoryCard";
import { MEMORY_TYPE_COLORS } from "./memoryColors";

const W = 960;
const H = 600;
const ITERATIONS = 250;
const MARGIN = 24;

interface SimNode {
  memory: MemorySummary;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  anchorX: number;
  anchorY: number;
}

/** Deterministic PRNG so the layout never reshuffles between renders. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Settled force layout, computed synchronously: ~100 nodes x 250 iterations
 * is well under 10ms, so there's no animation loop — the layout is
 * information, not entertainment. Project anchors sit on an ellipse and pull
 * their nodes together, which clusters the graph by project and converges
 * fast; the PRNG seed makes it reproducible.
 */
function layout(
  memories: MemorySummary[],
  edges: MemoryEdge[],
): Map<string, SimNode> {
  const projects = [...new Set(memories.map((memory) => memory.projectDir))];
  const anchors = new Map<string, { x: number; y: number }>();
  projects.forEach((projectDir, index) => {
    if (projects.length === 1) {
      anchors.set(projectDir, { x: W / 2, y: H / 2 });
      return;
    }
    const angle = (2 * Math.PI * index) / projects.length;
    anchors.set(projectDir, {
      x: W / 2 + 0.32 * W * Math.cos(angle),
      y: H / 2 + 0.32 * H * Math.sin(angle),
    });
  });

  const nodes: SimNode[] = memories.map((memory) => {
    const anchor = anchors.get(memory.projectDir) ?? { x: W / 2, y: H / 2 };
    const random = mulberry32(hashString(memory.id));
    return {
      memory,
      x: anchor.x + 60 * (random() - 0.5),
      y: anchor.y + 60 * (random() - 0.5),
      vx: 0,
      vy: 0,
      r: Math.min(14, Math.max(5, 4 + Math.sqrt(memory.sizeBytes) / 8)),
      anchorX: anchor.x,
      anchorY: anchor.y,
    };
  });
  const byId = new Map(nodes.map((node) => [node.memory.id, node]));

  for (let iteration = 0; iteration < ITERATIONS; iteration++) {
    const alpha = 1 - iteration / ITERATIONS;
    // pairwise repulsion
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i] as SimNode;
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j] as SimNode;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.max(Math.hypot(dx, dy), 4);
        if (distance >= 160) continue;
        const force = 1200 / (distance * distance);
        const ux = dx / distance;
        const uy = dy / distance;
        a.vx -= force * ux;
        a.vy -= force * uy;
        b.vx += force * ux;
        b.vy += force * uy;
      }
    }
    // edge springs
    for (const edge of edges) {
      const source = byId.get(edge.sourceId);
      const target = byId.get(edge.targetId);
      if (!source || !target) continue;
      const sameProject = source.memory.projectDir === target.memory.projectDir;
      const rest = sameProject ? 60 : 150;
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const distance = Math.max(Math.hypot(dx, dy), 1);
      const force = 0.02 * (distance - rest);
      const ux = dx / distance;
      const uy = dy / distance;
      source.vx += force * ux;
      source.vy += force * uy;
      target.vx -= force * ux;
      target.vy -= force * uy;
    }
    // anchor gravity (project clustering) + center gravity + integration
    for (const node of nodes) {
      node.vx += 0.015 * (node.anchorX - node.x) + 0.002 * (W / 2 - node.x);
      node.vy += 0.015 * (node.anchorY - node.y) + 0.002 * (H / 2 - node.y);
      node.vx *= 0.85;
      node.vy *= 0.85;
      node.x = Math.min(W - MARGIN, Math.max(MARGIN, node.x + node.vx * alpha));
      node.y = Math.min(H - MARGIN, Math.max(MARGIN, node.y + node.vy * alpha));
    }
  }
  return byId;
}

export function MemoryGraphView(props: {
  memories: MemorySummary[];
  edges: MemoryEdge[];
  danglingCount: number;
}) {
  const navigate = useNavigate();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const visibleIds = useMemo(
    () => new Set(props.memories.map((memory) => memory.id)),
    [props.memories],
  );
  const visibleEdges = useMemo(
    () =>
      props.edges.filter(
        (edge) =>
          visibleIds.has(edge.sourceId) && visibleIds.has(edge.targetId),
      ),
    [props.edges, visibleIds],
  );
  const positions = useMemo(
    () => layout(props.memories, visibleEdges),
    [props.memories, visibleEdges],
  );

  const incident = useMemo(() => {
    if (!hoveredId) return null;
    const ids = new Set([hoveredId]);
    for (const edge of visibleEdges) {
      if (edge.sourceId === hoveredId) ids.add(edge.targetId);
      if (edge.targetId === hoveredId) ids.add(edge.sourceId);
    }
    return ids;
  }, [hoveredId, visibleEdges]);

  const projectAnchors = useMemo(() => {
    const seen = new Map<string, { x: number; y: number }>();
    for (const node of positions.values()) {
      if (!seen.has(node.memory.projectDir)) {
        seen.set(node.memory.projectDir, { x: node.anchorX, y: node.anchorY });
      }
    }
    return seen;
  }, [positions]);

  const hovered = hoveredId ? positions.get(hoveredId) : null;

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Memory link graph"
        className="w-full"
      >
        <title>Memory link graph</title>
        {[...projectAnchors.entries()].map(([projectDir, anchor]) => (
          <text
            key={projectDir}
            x={anchor.x}
            y={anchor.y}
            textAnchor="middle"
            fontSize={11}
            className="fill-zinc-700 select-none"
          >
            {projectLabel(projectDir)}
          </text>
        ))}
        {visibleEdges.map((edge) => {
          const source = positions.get(edge.sourceId);
          const target = positions.get(edge.targetId);
          if (!source || !target) return null;
          const highlight =
            hoveredId === edge.sourceId || hoveredId === edge.targetId;
          return (
            <line
              key={`${edge.sourceId}->${edge.targetId}-${edge.slug}`}
              x1={source.x}
              y1={source.y}
              x2={target.x}
              y2={target.y}
              stroke={highlight ? "#22d3ee" : "#3f3f46"}
              strokeOpacity={highlight ? 0.9 : 0.5}
              strokeWidth={highlight ? 1.5 : 1}
            />
          );
        })}
        {[...positions.values()].map((node) => {
          const dimmed = incident !== null && !incident.has(node.memory.id);
          return (
            // biome-ignore lint/a11y/useSemanticElements: a native <button> cannot exist inside an SVG; role+tabIndex+key handlers is the SVG-idiomatic equivalent
            <circle
              key={node.memory.id}
              cx={node.x}
              cy={node.y}
              r={node.r}
              fill={MEMORY_TYPE_COLORS[node.memory.type]}
              fillOpacity={dimmed ? 0.2 : 0.85}
              stroke="#18181b"
              strokeWidth={1}
              className="cursor-pointer focus:outline-none"
              role="button"
              aria-label={`open memory: ${node.memory.title}`}
              tabIndex={0}
              onMouseEnter={() => setHoveredId(node.memory.id)}
              onMouseLeave={() => setHoveredId(null)}
              onFocus={() => setHoveredId(node.memory.id)}
              onBlur={() => setHoveredId(null)}
              onClick={() => navigate(memoryRoute(node.memory))}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  navigate(memoryRoute(node.memory));
                }
              }}
            >
              <title>{node.memory.title}</title>
            </circle>
          );
        })}
        {hovered ? (
          <g pointerEvents="none">
            <rect
              x={Math.min(W - 320, Math.max(0, hovered.x - 80))}
              y={Math.max(0, hovered.y - hovered.r - 30)}
              width={320}
              height={22}
              rx={4}
              fill="#09090b"
              fillOpacity={0.92}
            />
            <text
              x={Math.min(W - 312, Math.max(8, hovered.x - 72))}
              y={Math.max(15, hovered.y - hovered.r - 15)}
              fontSize={12}
              className="fill-zinc-200"
            >
              {hovered.memory.title.slice(0, 48)}
            </text>
          </g>
        ) : null}
      </svg>
      <p className="mt-2 text-[11px] text-zinc-600">
        {props.memories.length} memories · {visibleEdges.length} links
        {props.danglingCount > 0
          ? ` · ${props.danglingCount} dangling [[link]]${props.danglingCount === 1 ? "" : "s"}`
          : ""}{" "}
        — node size = file size, click to open
      </p>
    </div>
  );
}
