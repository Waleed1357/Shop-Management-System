"use client";

import { useEffect, useRef, useState } from "react";

interface ChartProps {
  labels: string[];
  values: number[];
  format?: (v: number) => string;
  height?: number;
}

const PAD = { top: 12, right: 12, bottom: 26, left: 48 };

/** Tracks the container's width so the SVG draws at real pixel size (text never stretches). */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/** Rounded "nice" max and 4 gridline ticks. */
function scale(values: number[]) {
  const max = Math.max(...values, 0);
  if (max === 0) return { max: 4, ticks: [0, 1, 2, 3, 4] };
  const raw = max / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  return { max: step * 4, ticks: [0, 1, 2, 3, 4].map((i) => i * step) };
}

/** Changes whenever the chart data changes, used to replay the entry animation. */
const dataKey = (labels: string[], values: number[]) => `${labels.join("|")}:${values.join(",")}`;

const compact = (v: number) => Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(v);

function Frame({
  width,
  height,
  ticks,
  max,
  labels,
  children,
}: {
  width: number;
  height: number;
  ticks: number[];
  max: number;
  labels: string[];
  children: React.ReactNode;
}) {
  const innerH = height - PAD.top - PAD.bottom;
  const innerW = width - PAD.left - PAD.right;
  const band = innerW / labels.length;
  return (
    <svg width={width} height={height} className="block overflow-visible">
      {ticks.map((t) => {
        const y = PAD.top + innerH - (t / max) * innerH;
        return (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y} y2={y} className="stroke-slate-200" strokeWidth={1} />
            <text x={PAD.left - 8} y={y} dy="0.32em" textAnchor="end" className="fill-slate-400 text-[11px]">
              {compact(t)}
            </text>
          </g>
        );
      })}
      {labels.map((l, i) =>
        band < 30 && i % 2 === 1 ? null : (
          <text key={l} x={PAD.left + band * i + band / 2} y={height - 6} textAnchor="middle" className="fill-slate-400 text-[11px]">
            {l}
          </text>
        ),
      )}
      {children}
    </svg>
  );
}

function Tooltip({ x, width, label, value }: { x: number; width: number; label: string; value: string }) {
  // Keep the tooltip inside the card on small screens.
  const left = Math.min(Math.max(x, 70), Math.max(70, width - 70));
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-800 px-2.5 py-1.5 text-xs text-white shadow-lg"
      style={{ left }}
    >
      <span className="text-slate-300">{label}</span> <span className="font-semibold">{value}</span>
    </div>
  );
}

export function LineChart({ labels, values, format = String, height = 220 }: ChartProps) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const { max, ticks } = scale(values);
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const band = innerW / labels.length;
  const x = (i: number) => PAD.left + band * i + band / 2;
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const line = values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  const area = `${line} L${x(values.length - 1)},${PAD.top + innerH} L${x(0)},${PAD.top + innerH} Z`;

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }} onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}>
      {width > 0 && (
        <Frame width={width} height={height} ticks={ticks} max={max} labels={labels}>
          {/* key = the data, so the draw animation replays whenever a filter changes */}
          <g key={dataKey(labels, values)}>
            <path d={area} className="chart-area fill-red-600/10" />
            <path
              d={line}
              fill="none"
              pathLength={1}
              className="chart-line stroke-red-600"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>
          {hover !== null && (
            <>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} className="stroke-slate-300" strokeDasharray="3 3" />
              <circle cx={x(hover)} cy={y(values[hover])} r={5} className="fill-red-600 stroke-white" strokeWidth={2} />
            </>
          )}
          {labels.map((l, i) => (
            <rect
              key={l}
              x={PAD.left + band * i}
              y={PAD.top}
              width={band}
              height={innerH}
              fill="transparent"
              onPointerEnter={() => setHover(i)}
              onPointerDown={() => setHover(i)}
            />
          ))}
        </Frame>
      )}
      {hover !== null && <Tooltip x={x(hover)} width={width} label={labels[hover]} value={format(values[hover])} />}
    </div>
  );
}

export function BarChart({ labels, values, format = String, height = 220 }: ChartProps) {
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const { max, ticks } = scale(values);
  const innerW = Math.max(0, width - PAD.left - PAD.right);
  const innerH = height - PAD.top - PAD.bottom;
  const band = innerW / labels.length;
  const barW = Math.max(4, Math.min(28, band * 0.6));
  const r = Math.min(4, barW / 2);

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }} onPointerLeave={(e) => e.pointerType === "mouse" && setHover(null)}>
      {width > 0 && (
        <Frame width={width} height={height} ticks={ticks} max={max} labels={labels}>
          <g key={dataKey(labels, values)}>
          {values.map((v, i) => {
            const h = (v / max) * innerH;
            const bx = PAD.left + band * i + (band - barW) / 2;
            const by = PAD.top + innerH - h;
            // Rounded top corners only, flat on the baseline.
            const d =
              h <= 0
                ? ""
                : h < r
                  ? `M${bx},${by + h} V${by} H${bx + barW} V${by + h} Z`
                  : `M${bx},${by + h} V${by + r} Q${bx},${by} ${bx + r},${by} H${bx + barW - r} Q${bx + barW},${by} ${bx + barW},${by + r} V${by + h} Z`;
            return (
              <g key={labels[i]} onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}>
                <rect x={PAD.left + band * i} y={PAD.top} width={band} height={innerH} fill="transparent" />
                {d && (
                  <path
                    d={d}
                    className={`chart-bar ${hover === i ? "fill-red-700" : "fill-red-600"}`}
                    style={{ animationDelay: `${Math.min(i * 25, 400)}ms` }}
                  />
                )}
              </g>
            );
          })}
          </g>
        </Frame>
      )}
      {hover !== null && <Tooltip x={PAD.left + band * hover + band / 2} width={width} label={labels[hover]} value={format(values[hover])} />}
    </div>
  );
}
