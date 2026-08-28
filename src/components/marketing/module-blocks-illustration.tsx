const SQRT3_OVER_2 = 0.8660254;

type Block = { cx: number; cy: number; r: number; accent?: boolean };

/**
 * Five independent isometric-block outlines loosely clustered together -
 * literally "independent business systems, one platform" (this hero's own
 * headline) rather than generic clip art. Each block is a regular hexagon
 * (the outer edges) plus three spokes from its center to alternating
 * vertices (splitting it into the classic isometric-cube top/left/right
 * faces); every edge has length exactly `r`, so the stroke-dasharray/
 * dashoffset reveal on each element can use an exact computed length
 * instead of a guessed safety constant.
 */
const BLOCKS: Block[] = [
  { cx: 100, cy: 240, r: 38 },
  { cx: 190, cy: 260, r: 34 },
  { cx: 150, cy: 165, r: 30 },
  { cx: 250, cy: 175, r: 26 },
  { cx: 215, cy: 90, r: 22, accent: true },
];

function hexPoints(cx: number, cy: number, r: number) {
  const dx = SQRT3_OVER_2 * r;
  const dy = 0.5 * r;
  return {
    top: [cx, cy - r] as const,
    upperRight: [cx + dx, cy - dy] as const,
    lowerRight: [cx + dx, cy + dy] as const,
    bottom: [cx, cy + r] as const,
    lowerLeft: [cx - dx, cy + dy] as const,
    upperLeft: [cx - dx, cy - dy] as const,
    center: [cx, cy] as const,
  };
}

export function ModuleBlocksIllustration({ className }: { className?: string }) {
  return (
    <svg
      viewBox="40 40 280 280"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {BLOCKS.map((block, index) => {
        const p = hexPoints(block.cx, block.cy, block.r);
        const outlineLength = 6 * block.r;
        const spokeLength = block.r;
        const delay = `${index * 160}ms`;
        const colorClass = block.accent ? "text-primary" : "text-muted-foreground";
        return (
          <g key={index} className={colorClass}>
            <path
              className="module-block-draw"
              style={{ animationDelay: delay, strokeDasharray: outlineLength + 6, strokeDashoffset: outlineLength + 6 }}
              d={`M${p.top[0]},${p.top[1]} L${p.upperRight[0]},${p.upperRight[1]} L${p.lowerRight[0]},${p.lowerRight[1]} L${p.bottom[0]},${p.bottom[1]} L${p.lowerLeft[0]},${p.lowerLeft[1]} L${p.upperLeft[0]},${p.upperLeft[1]} Z`}
            />
            {([p.top, p.lowerRight, p.lowerLeft] as const).map((point, spokeIndex) => (
              <line
                key={spokeIndex}
                className="module-block-draw"
                style={{ animationDelay: delay, strokeDasharray: spokeLength + 4, strokeDashoffset: spokeLength + 4 }}
                x1={p.center[0]}
                y1={p.center[1]}
                x2={point[0]}
                y2={point[1]}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}
