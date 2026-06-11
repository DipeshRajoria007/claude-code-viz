import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { MemoryEdge, MemorySummary } from "../../../../shared/api-types";
import { memoryRoute } from "./MemoryCard";
import { MEMORY_TYPE_COLORS } from "./memoryColors";

/**
 * Obsidian-style live knowledge graph: a running d3-force simulation with
 * draggable nodes, wheel zoom, background pan, glow, degree-based sizing and
 * labels that fade in as you zoom. Rendering is plain SVG — at ~100 nodes
 * React re-rendering per tick is cheap.
 */

const W = 1200;
const H = 760;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;

interface SimNode extends SimulationNodeDatum {
  id: string;
  memory: MemorySummary;
  r: number;
  degree: number;
}

type SimLink = SimulationLinkDatum<SimNode> & { slug: string };

function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Deterministic spawn position so reloads don't reshuffle the universe. */
function spawn(id: string, anchor: { x: number; y: number }) {
  const h = hashString(id);
  return {
    x: anchor.x + ((h & 0xffff) / 0xffff - 0.5) * 220,
    y: anchor.y + (((h >>> 16) & 0xffff) / 0xffff - 0.5) * 220,
  };
}

interface Transform {
  x: number;
  y: number;
  k: number;
}

export function MemoryGraphView(props: {
  memories: MemorySummary[];
  edges: MemoryEdge[];
  danglingCount: number;
}) {
  const navigate = useNavigate();
  const svgRef = useRef<SVGSVGElement>(null);
  const [, setTick] = useState(0);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 });

  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const linksRef = useRef<SimLink[]>([]);
  // pointer interaction state
  const dragRef = useRef<{
    node: SimNode | null;
    panning: boolean;
    startX: number;
    startY: number;
    moved: number;
  }>({ node: null, panning: false, startX: 0, startY: 0, moved: 0 });

  const visibleEdges = useMemo(() => {
    const ids = new Set(props.memories.map((memory) => memory.id));
    return props.edges.filter(
      (edge) => ids.has(edge.sourceId) && ids.has(edge.targetId),
    );
  }, [props.memories, props.edges]);

  // (re)build the simulation when the filtered node set changes
  useEffect(() => {
    const degree = new Map<string, number>();
    for (const edge of visibleEdges) {
      degree.set(edge.sourceId, (degree.get(edge.sourceId) ?? 0) + 1);
      degree.set(edge.targetId, (degree.get(edge.targetId) ?? 0) + 1);
    }

    // soft project anchors on an ellipse keep semantic clustering while the
    // physics stays organic (orphan memories drift to their project's side)
    const projects = [...new Set(props.memories.map((m) => m.projectDir))];
    const anchors = new Map<string, { x: number; y: number }>();
    projects.forEach((projectDir, index) => {
      const angle = (2 * Math.PI * index) / Math.max(projects.length, 1);
      anchors.set(projectDir, {
        x: W / 2 + (projects.length > 1 ? 0.27 * W * Math.cos(angle) : 0),
        y: H / 2 + (projects.length > 1 ? 0.27 * H * Math.sin(angle) : 0),
      });
    });

    const previous = new Map(nodesRef.current.map((node) => [node.id, node]));
    const nodes: SimNode[] = props.memories.map((memory) => {
      const old = previous.get(memory.id);
      const anchor = anchors.get(memory.projectDir) ?? { x: W / 2, y: H / 2 };
      const position = old
        ? { x: old.x ?? W / 2, y: old.y ?? H / 2 }
        : spawn(memory.id, anchor);
      const deg = degree.get(memory.id) ?? 0;
      return {
        id: memory.id,
        memory,
        degree: deg,
        r: Math.min(16, 4 + Math.sqrt(memory.sizeBytes) / 14 + deg * 1.4),
        ...position,
      };
    });
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const links: SimLink[] = visibleEdges.map((edge) => ({
      source: edge.sourceId,
      target: edge.targetId,
      slug: edge.slug,
    }));

    nodesRef.current = nodes;
    linksRef.current = links;

    simRef.current?.stop();
    const simulation = forceSimulation<SimNode>(nodes)
      .force("charge", forceManyBody<SimNode>().strength(-160).distanceMax(420))
      .force(
        "link",
        forceLink<SimNode, SimLink>(links)
          .id((node) => node.id)
          .distance((link) => {
            const source = link.source as SimNode;
            const target = link.target as SimNode;
            return source.memory.projectDir === target.memory.projectDir
              ? 70
              : 160;
          })
          .strength(0.5),
      )
      .force(
        "collide",
        forceCollide<SimNode>().radius((node) => node.r + 6),
      )
      .force(
        "x",
        forceX<SimNode>((node) => {
          const anchor = anchors.get(node.memory.projectDir);
          return anchor?.x ?? W / 2;
        }).strength(0.045),
      )
      .force(
        "y",
        forceY<SimNode>((node) => {
          const anchor = anchors.get(node.memory.projectDir);
          return anchor?.y ?? H / 2;
        }).strength(0.045),
      )
      .alpha(1)
      .alphaDecay(0.018)
      .velocityDecay(0.35)
      .on("tick", () => setTick((t) => t + 1));
    simRef.current = simulation;
    void byId;
    return () => {
      simulation.stop();
    };
  }, [props.memories, visibleEdges]);

  // non-passive wheel listener (React's onWheel can't preventDefault)
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const px = ((event.clientX - rect.left) * W) / rect.width;
      const py = ((event.clientY - rect.top) * H) / rect.height;
      setTransform((current) => {
        const factor = Math.exp(-event.deltaY * 0.0022);
        const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current.k * factor));
        const scale = k / current.k;
        return {
          k,
          x: px - (px - current.x) * scale,
          y: py - (py - current.y) * scale,
        };
      });
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, []);

  function toViewBox(event: { clientX: number; clientY: number }) {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * W) / rect.width,
      y: ((event.clientY - rect.top) * H) / rect.height,
    };
  }

  function onNodePointerDown(node: SimNode, event: React.PointerEvent) {
    event.stopPropagation();
    (event.target as Element).setPointerCapture(event.pointerId);
    dragRef.current = {
      node,
      panning: false,
      startX: event.clientX,
      startY: event.clientY,
      moved: 0,
    };
    simRef.current?.alphaTarget(0.25).restart();
  }

  function onBackgroundPointerDown(event: React.PointerEvent) {
    (event.target as Element).setPointerCapture(event.pointerId);
    dragRef.current = {
      node: null,
      panning: true,
      startX: event.clientX,
      startY: event.clientY,
      moved: 0,
    };
  }

  function onPointerMove(event: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag.node && !drag.panning) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));

    if (drag.node) {
      const point = toViewBox(event);
      drag.node.fx = (point.x - transform.x) / transform.k;
      drag.node.fy = (point.y - transform.y) / transform.k;
    } else if (drag.panning) {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      setTransform((current) => ({
        ...current,
        x: current.x + (dx * W) / rect.width,
        y: current.y + (dy * H) / rect.height,
      }));
      drag.startX = event.clientX;
      drag.startY = event.clientY;
    }
  }

  function onPointerUp(event: React.PointerEvent) {
    const drag = dragRef.current;
    if (drag.node) {
      const clicked = drag.moved < 5;
      const node = drag.node;
      node.fx = null;
      node.fy = null;
      simRef.current?.alphaTarget(0);
      dragRef.current = {
        node: null,
        panning: false,
        startX: 0,
        startY: 0,
        moved: 0,
      };
      if (clicked) navigate(memoryRoute(node.memory));
      void event;
      return;
    }
    dragRef.current = {
      node: null,
      panning: false,
      startX: 0,
      startY: 0,
      moved: 0,
    };
  }

  const incident = useMemo(() => {
    if (!hoveredId) return null;
    const ids = new Set([hoveredId]);
    for (const edge of visibleEdges) {
      if (edge.sourceId === hoveredId) ids.add(edge.targetId);
      if (edge.targetId === hoveredId) ids.add(edge.sourceId);
    }
    return ids;
  }, [hoveredId, visibleEdges]);

  // labels fade in as you zoom; hovered neighborhood is always labeled
  const labelOpacity = Math.min(1, Math.max(0, (transform.k - 0.85) / 0.6));
  const nodes = nodesRef.current;
  const links = linksRef.current;

  return (
    <div className="relative overflow-hidden rounded-xl border border-zinc-800 bg-[#0b0b0e]">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Memory knowledge graph"
        className="h-[calc(100vh-220px)] min-h-[420px] w-full cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={onBackgroundPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <title>Memory knowledge graph</title>
        <defs>
          <filter id="node-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g
          transform={`translate(${transform.x},${transform.y}) scale(${transform.k})`}
        >
          {links.map((link) => {
            const source = link.source as SimNode;
            const target = link.target as SimNode;
            if (typeof source === "string" || typeof target === "string")
              return null;
            const highlight =
              hoveredId !== null &&
              (source.id === hoveredId || target.id === hoveredId);
            const dimmed = incident !== null && !highlight;
            return (
              <line
                key={`${source.id}->${target.id}-${link.slug}`}
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
                stroke={highlight ? "#67e8f9" : "#52525b"}
                strokeOpacity={highlight ? 0.9 : dimmed ? 0.06 : 0.28}
                strokeWidth={(highlight ? 1.8 : 1) / transform.k}
              />
            );
          })}
          {nodes.map((node) => {
            const dimmed = incident !== null && !incident.has(node.id);
            const isHovered = hoveredId === node.id;
            const color = MEMORY_TYPE_COLORS[node.memory.type];
            const showLabel =
              !dimmed &&
              (labelOpacity > 0.02 || isHovered || incident?.has(node.id));
            return (
              <g key={node.id} opacity={dimmed ? 0.14 : 1}>
                {/* biome-ignore lint/a11y/useSemanticElements: a native <button> cannot exist inside an SVG; role+tabIndex+key handlers is the SVG-idiomatic equivalent */}
                <circle
                  cx={node.x}
                  cy={node.y}
                  r={isHovered ? node.r * 1.25 : node.r}
                  fill={color}
                  fillOpacity={0.92}
                  filter="url(#node-glow)"
                  className="cursor-pointer focus:outline-none"
                  role="button"
                  aria-label={`open memory: ${node.memory.title}`}
                  tabIndex={0}
                  onPointerDown={(event) => onNodePointerDown(node, event)}
                  onMouseEnter={() => setHoveredId(node.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onFocus={() => setHoveredId(node.id)}
                  onBlur={() => setHoveredId(null)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      navigate(memoryRoute(node.memory));
                    }
                  }}
                />
                {showLabel ? (
                  <text
                    x={node.x}
                    y={(node.y ?? 0) + node.r + 12 / transform.k}
                    textAnchor="middle"
                    fontSize={11 / transform.k}
                    className="pointer-events-none select-none fill-zinc-400"
                    opacity={
                      isHovered || incident?.has(node.id) ? 1 : labelOpacity
                    }
                  >
                    {node.memory.title.length > 28
                      ? `${node.memory.title.slice(0, 27)}…`
                      : node.memory.title}
                  </text>
                ) : null}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="pointer-events-none absolute bottom-3 left-4 text-[11px] text-zinc-600">
        {props.memories.length} memories · {visibleEdges.length} links
        {props.danglingCount > 0 ? ` · ${props.danglingCount} dangling` : ""} —
        scroll to zoom · drag canvas to pan · drag nodes to rearrange · click to
        open
      </div>
      <button
        type="button"
        onClick={() => setTransform({ x: 0, y: 0, k: 1 })}
        className="absolute top-3 right-3 rounded-md border border-zinc-700/80 bg-zinc-900/80 px-2 py-1 text-xs text-zinc-400 backdrop-blur hover:bg-zinc-800"
      >
        reset view
      </button>
    </div>
  );
}
