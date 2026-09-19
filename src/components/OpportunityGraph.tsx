"use client";

import { useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  Position,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { GraphNode, GraphNodeType, OpportunityGraph } from "@/lib/types";

/**
 * Opportunity graph view (§5.12).
 *
 * Renders the honest, deterministic graph produced by `buildOpportunityGraph`
 * so it is USEFUL, not decorative: the *warmest path* into the role (alumni
 * route) is made visually obvious — brand-ringed nodes + animated brand edges —
 * and a filter lets you isolate the path, the people, or the evidence chain.
 *
 * Layout is deterministic: nodes are grouped into columns by type and stacked
 * by insertion order. No random positions, so the picture is stable.
 */

const BRAND = "#2549ea"; // tailwind brand-600

/* Column (left→right reading order) per node type. */
const COLUMN: Record<GraphNodeType, number> = {
  candidate: 0,
  university: 1,
  project: 1,
  skill: 2,
  team: 3,
  company: 3,
  person: 4,
  job: 4,
  article: 4,
};

/* Color + human category label per node type. */
type TypeStyle = { bg: string; border: string; dot: string; kind: string };
const TYPE_STYLE: Record<GraphNodeType, TypeStyle> = {
  candidate: { bg: "#eef4ff", border: "#2549ea", dot: "#2549ea", kind: "You" },
  university: { bg: "#f5f3ff", border: "#7c3aed", dot: "#7c3aed", kind: "University" },
  project: { bg: "#ecfdf5", border: "#059669", dot: "#059669", kind: "Project" },
  skill: { bg: "#ecfeff", border: "#0891b2", dot: "#0891b2", kind: "Skill" },
  team: { bg: "#fffbeb", border: "#d97706", dot: "#d97706", kind: "Team" },
  company: { bg: "#f8fafc", border: "#475569", dot: "#475569", kind: "Company" },
  person: { bg: "#fff1f2", border: "#e11d48", dot: "#e11d48", kind: "Person" },
  job: { bg: "#eef2ff", border: "#1d38d7", dot: "#1d38d7", kind: "Role" },
  article: { bg: "#f8fafc", border: "#475569", dot: "#475569", kind: "Article" },
};

const COL_W = 260;
const ROW_H = 100;
const TOP = 24;
const NODE_W = 210;

type FilterKey = "all" | "warmest" | "people" | "evidence";
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "warmest", label: "Warmest path" },
  { key: "people", label: "People only" },
  { key: "evidence", label: "Evidence only" },
];

const PEOPLE_TYPES = new Set<GraphNodeType>(["candidate", "person", "company", "team", "job"]);
const EVIDENCE_TYPES = new Set<GraphNodeType>(["candidate", "skill", "project", "job", "university"]);

/* Inner card rendered inside each React Flow node. */
function NodeCard({
  node,
  typeStyle,
  onPath,
}: {
  node: GraphNode;
  typeStyle: TypeStyle;
  onPath: boolean;
}) {
  return (
    <div style={{ textAlign: "left", padding: "8px 10px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
        <span
          style={{ width: 7, height: 7, borderRadius: 999, background: typeStyle.dot, flexShrink: 0 }}
        />
        <span
          style={{
            fontSize: 9,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: typeStyle.border,
            fontWeight: 700,
          }}
        >
          {typeStyle.kind}
        </span>
        {onPath && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 8.5,
              fontWeight: 700,
              color: "#fff",
              background: BRAND,
              borderRadius: 999,
              padding: "1px 6px",
              letterSpacing: "0.03em",
            }}
          >
            WARMEST
          </span>
        )}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: "#0f172a", lineHeight: 1.25 }}>
        {node.label}
      </div>
      {node.sublabel && (
        <div style={{ fontSize: 10, color: "#64748b", lineHeight: 1.25, marginTop: 2 }}>
          {node.sublabel}
        </div>
      )}
    </div>
  );
}

export function OpportunityGraphView({ graph }: { graph: OpportunityGraph }) {
  const [filter, setFilter] = useState<FilterKey>("all");

  /* Warmest-path lookups (stable). */
  const warmSet = useMemo(() => new Set(graph.warmestPath), [graph.warmestPath]);
  const warmPairs = useMemo(() => {
    const s = new Set<string>();
    for (let i = 0; i < graph.warmestPath.length - 1; i++) {
      const a = graph.warmestPath[i];
      const b = graph.warmestPath[i + 1];
      s.add(`${a}|${b}`);
      s.add(`${b}|${a}`);
    }
    return s;
  }, [graph.warmestPath]);

  const labelById = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of graph.nodes) m.set(n.id, n.label);
    return m;
  }, [graph.nodes]);

  /* Deterministic column layout — computed once for the whole graph so
     positions never jump when the filter changes. */
  const allNodes: Node[] = useMemo(() => {
    const colCount: Record<number, number> = {};
    return graph.nodes.map((n) => {
      const col = COLUMN[n.type];
      const idx = colCount[col] ?? 0;
      colCount[col] = idx + 1;
      const s = TYPE_STYLE[n.type];
      const onPath = warmSet.has(n.id);
      return {
        id: n.id,
        position: { x: col * COL_W + 24, y: TOP + idx * ROW_H },
        data: { label: <NodeCard node={n} typeStyle={s} onPath={onPath} /> },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        connectable: false,
        style: {
          width: NODE_W,
          padding: 0,
          borderRadius: 14,
          border: `1px solid ${s.border}`,
          background: s.bg,
          boxShadow: onPath
            ? `0 0 0 3px ${BRAND}, 0 8px 24px -8px rgba(16,24,40,0.25)`
            : "0 1px 3px rgba(16,24,40,0.08)",
        },
      };
    });
  }, [graph.nodes, warmSet]);

  const allEdges: Edge[] = useMemo(
    () =>
      graph.edges.map((e) => {
        const warm = warmPairs.has(`${e.source}|${e.target}`);
        return {
          id: e.id,
          source: e.source,
          target: e.target,
          label: e.relationship,
          animated: warm,
          style: { stroke: warm ? BRAND : "#cbd5e1", strokeWidth: warm ? 2.5 : 1.5 },
          labelStyle: {
            fontSize: 10,
            fill: warm ? BRAND : "#64748b",
            fontWeight: warm ? 600 : 400,
          },
          labelBgStyle: { fill: "#ffffff", fillOpacity: 0.85 },
          labelBgPadding: [3, 2] as [number, number],
          labelBgBorderRadius: 4,
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: warm ? BRAND : "#94a3b8",
            width: 16,
            height: 16,
          },
        };
      }),
    [graph.edges, warmPairs],
  );

  /* Apply the active filter. */
  const { nodes, edges } = useMemo(() => {
    if (filter === "all") return { nodes: allNodes, edges: allEdges };

    if (filter === "warmest") {
      return {
        nodes: allNodes.filter((n) => warmSet.has(n.id)),
        edges: allEdges.filter((e) => warmPairs.has(`${e.source}|${e.target}`)),
      };
    }

    const types = filter === "people" ? PEOPLE_TYPES : EVIDENCE_TYPES;
    const visible = new Set(
      graph.nodes.filter((n) => types.has(n.type)).map((n) => n.id),
    );
    return {
      nodes: allNodes.filter((n) => visible.has(n.id)),
      edges: allEdges.filter((e) => visible.has(e.source) && visible.has(e.target)),
    };
  }, [filter, allNodes, allEdges, warmSet, warmPairs, graph.nodes]);

  /* Human-readable warmest path (accessibility + usefulness). */
  const warmestLabels = graph.warmestPath.map((id) => labelById.get(id) ?? id);

  const legendTypes: GraphNodeType[] = [
    "candidate",
    "university",
    "project",
    "skill",
    "team",
    "company",
    "person",
    "job",
  ];

  return (
    <div>
      {/* Controls: filter + legend */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div
          role="group"
          aria-label="Filter the opportunity graph"
          className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1"
        >
          {FILTERS.map((f) => {
            const active = f.key === filter;
            return (
              <button
                key={f.key}
                type="button"
                aria-pressed={active}
                onClick={() => setFilter(f.key)}
                className={
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 " +
                  (active
                    ? "bg-white text-brand-700 shadow-sm"
                    : "text-slate-600 hover:text-slate-900")
                }
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1" aria-label="Node type legend">
          {legendTypes.map((t) => (
            <li key={t} className="inline-flex items-center gap-1.5 text-[11px] text-slate-500">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: TYPE_STYLE[t].dot }}
              />
              {TYPE_STYLE[t].kind}
            </li>
          ))}
        </ul>
      </div>

      {/* Warmest path, in words — accessible alternative to the highlight. */}
      {warmestLabels.length > 0 && (
        <p className="mb-3 text-sm text-slate-600">
          <span className="font-semibold text-brand-700">Warmest path in:</span>{" "}
          {warmestLabels.join(" → ")}
        </p>
      )}

      <div
        role="img"
        aria-label={`Opportunity graph. Warmest path into the role: ${warmestLabels.join(", then ")}.`}
        style={{ height: 560 }}
        className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/60"
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          fitView
          minZoom={0.3}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#e2e8f0" gap={20} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </div>
  );
}
