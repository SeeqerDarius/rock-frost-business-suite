"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import { PersonAvatar } from "../../person-avatar";

export interface TreeNode {
  id: string;
  fullName: string;
  jobTitle: string | null;
  photoData: string | null;
  status: string;
  children: TreeNode[];
}

function NodeCard({ node, isCurrent }: { node: TreeNode; isCurrent: boolean }) {
  return (
    <Link
      href={`/app/hr/employees/${node.id}`}
      className={`flex w-36 flex-col items-center gap-1 rounded-lg border bg-card p-3 text-center shadow-sm transition-colors hover:border-primary/40 hover:bg-secondary/50 ${isCurrent ? "border-primary bg-primary/5" : ""}`}
    >
      <PersonAvatar id={node.id} fullName={node.fullName} photoData={node.photoData} size={40} />
      <span className="line-clamp-2 text-xs font-medium">{node.fullName}</span>
      {node.jobTitle ? <span className="line-clamp-1 text-[11px] text-muted-foreground">{node.jobTitle}</span> : null}
    </Link>
  );
}

/** A photo-card-and-connector-line tree, hand-built with flexbox (no charting
 * dependency exists in this codebase, and none is justified at the realistic
 * scale here — a few dozen employees, 2-4 reporting levels). Each child's
 * horizontal position is computed from its index among equal-width flex
 * siblings, not replicated via fragile :first-child/:last-child CSS tricks. */
export function OrgChartNode({ node, currentId, depth = 0 }: { node: TreeNode; currentId: string; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <NodeCard node={node} isCurrent={node.id === currentId} />
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="absolute -bottom-2.5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border bg-background px-2 py-0.5 text-[11px] whitespace-nowrap text-muted-foreground shadow-sm hover:bg-secondary"
          >
            {node.children.length} {node.children.length === 1 ? "person" : "people"}
            {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          </button>
        ) : null}
      </div>

      {hasChildren && expanded ? (
        <>
          <div className="h-5 w-px bg-border" />
          <div className="relative flex items-start">
            {node.children.length > 1 ? (
              <div
                className="absolute top-0 h-px bg-border"
                style={{ left: `${(50 / node.children.length).toFixed(4)}%`, right: `${(50 / node.children.length).toFixed(4)}%` }}
              />
            ) : null}
            {node.children.map((child) => (
              <div key={child.id} className="flex flex-1 flex-col items-center px-3">
                <div className="h-5 w-px bg-border" />
                <OrgChartNode node={child} currentId={currentId} depth={depth + 1} />
              </div>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
