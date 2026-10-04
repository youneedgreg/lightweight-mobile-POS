"use client";

import { formatKes } from "@liquor-pos/shared";
import { useCallback, useState } from "react";

export interface SalesChartPoint {
  day: string;
  revenue: number;
  grossProfit: number;
  saleCount: number;
}

const HEIGHT = 220;
const PADDING = { top: 12, right: 8, bottom: 28, left: 64 };
const MAX_BAR = 24;

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00+03:00`).toLocaleDateString("en-KE", { day: "numeric", month: "short", timeZone: "Africa/Nairobi" });

/** Rounds up to a tidy axis maximum (1, 2 or 5 × 10ⁿ). */
function niceMax(value: number): number {
  if (value <= 0) return 1000;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((m) => m * magnitude >= value) ?? 10;
  return step * magnitude;
}

/** Path for a bar with 4px rounded top corners and a square base. */
function barPath(x: number, y: number, width: number, height: number): string {
  const r = Math.min(4, width / 2, height);
  return `M${x},${y + height} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${y + height} Z`;
}

/**
 * Daily revenue (one series, so no legend: the heading names it). Hover or
 * focus a day for revenue, gross profit and sale count; a table view
 * carries the same numbers for screen readers.
 */
export function SalesChart({ points }: { points: SalesChartPoint[] }) {
  const [width, setWidth] = useState(720);
  const [active, setActive] = useState<number | null>(null);

  // Track the container width so the chart fills it and follows resizes.
  const measure = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(280, Math.round(entry.contentRect.width)));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const max = niceMax(Math.max(...points.map((p) => p.revenue)));
  const plotWidth = width - PADDING.left - PADDING.right;
  const plotHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const band = plotWidth / Math.max(points.length, 1);
  const barWidth = Math.max(2, Math.min(MAX_BAR, band - 2));
  const ticks = [0, 0.5, 1].map((f) => f * max);
  const labelEvery = Math.ceil(points.length / Math.max(1, Math.floor(plotWidth / 56)));
  const activePoint = active !== null ? points[active] : null;

  return (
    <div className="flex flex-col gap-2">
      <div
        className="relative"
        ref={measure}
        onMouseLeave={() => setActive(null)}
      >
        <svg width={width} height={HEIGHT} role="img" aria-label="Revenue by day" className="block">
          {ticks.map((tick) => {
            const y = PADDING.top + plotHeight - (tick / max) * plotHeight;
            return (
              <g key={tick}>
                <line x1={PADDING.left} x2={width - PADDING.right} y1={y} y2={y} stroke="var(--chart-grid)" strokeWidth={1} />
                <text x={PADDING.left - 8} y={y + 4} textAnchor="end" fontSize={11} fill="var(--chart-text)" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {tick >= 1000 ? `${tick / 1000}k` : tick}
                </text>
              </g>
            );
          })}
          {points.map((point, index) => {
            const height = (point.revenue / max) * plotHeight;
            const x = PADDING.left + index * band + (band - barWidth) / 2;
            const y = PADDING.top + plotHeight - height;
            return (
              <g key={point.day}>
                {height > 0 && <path d={barPath(x, y, barWidth, height)} fill="var(--series-1)" opacity={active === null || active === index ? 1 : 0.45} />}
                {index % labelEvery === 0 && (
                  <text x={x + barWidth / 2} y={HEIGHT - 8} textAnchor="middle" fontSize={11} fill="var(--chart-text)">
                    {dayLabel(point.day)}
                  </text>
                )}
                {/* Hit target: the whole day column, larger than the bar. */}
                <rect
                  x={PADDING.left + index * band}
                  y={PADDING.top}
                  width={band}
                  height={plotHeight}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${dayLabel(point.day)}: ${formatKes(point.revenue)}`}
                  onMouseEnter={() => setActive(index)}
                  onFocus={() => setActive(index)}
                  onBlur={() => setActive(null)}
                />
              </g>
            );
          })}
        </svg>
        {activePoint && active !== null && (
          <div
            role="status"
            className="pointer-events-none absolute top-0 z-10 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
            style={{
              left: Math.min(Math.max(PADDING.left + active * band + band / 2 - 80, 0), width - 170),
              width: 170,
            }}
          >
            <div className="font-medium">{dayLabel(activePoint.day)}</div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Revenue</span>
              <span>{formatKes(activePoint.revenue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Gross profit</span>
              <span>{formatKes(activePoint.grossProfit)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Sales</span>
              <span>{activePoint.saleCount}</span>
            </div>
          </div>
        )}
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-neutral-500">Show as table</summary>
        <table className="mt-2 w-full max-w-md text-left">
          <thead className="text-neutral-500">
            <tr>
              <th className="py-1 font-medium">Day</th>
              <th className="py-1 text-right font-medium">Revenue</th>
              <th className="py-1 text-right font-medium">Gross profit</th>
              <th className="py-1 text-right font-medium">Sales</th>
            </tr>
          </thead>
          <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
            {points.map((p) => (
              <tr key={p.day} className="border-t border-neutral-100 dark:border-neutral-900">
                <td className="py-1">{dayLabel(p.day)}</td>
                <td className="py-1 text-right">{formatKes(p.revenue)}</td>
                <td className="py-1 text-right">{formatKes(p.grossProfit)}</td>
                <td className="py-1 text-right">{p.saleCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
