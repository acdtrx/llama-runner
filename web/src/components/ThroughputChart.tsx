import { useMemo } from 'react';

import type { RequestMetrics } from '../types';

interface Props {
  requests: RequestMetrics[];
}

const WINDOW = 50;
const CHART_HEIGHT = 120;

export function ThroughputChart({ requests }: Props): React.ReactElement {
  const window = useMemo(() => requests.slice(-WINDOW), [requests]);
  const promptSeries = window.map((r) => r.promptTokensPerSecond ?? 0);
  const genSeries = window.map((r) => r.generationTokensPerSecond ?? 0);
  const maxY = Math.max(1, ...promptSeries, ...genSeries);

  // Use a fixed viewBox with width equal to the point count (or a safe min).
  // preserveAspectRatio="none" lets the container width expand freely without
  // stretching any text, because the text is rendered as HTML outside the SVG.
  const svgWidth = Math.max(window.length - 1, 1);

  function pathFor(series: number[]): string {
    if (series.length === 0) return '';
    if (series.length === 1) {
      const y = CHART_HEIGHT - (series[0]! / maxY) * CHART_HEIGHT;
      return `M0,${y}`;
    }
    return series
      .map((v, i) => {
        const x = i;
        const y = CHART_HEIGHT - (v / maxY) * CHART_HEIGHT;
        return `${i === 0 ? 'M' : 'L'}${x},${y.toFixed(2)}`;
      })
      .join(' ');
  }

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <section className="rounded border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide opacity-60">Throughput (tok/s)</h3>
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-wide opacity-70">
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 bg-sky-500" /> prompt
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-4 bg-emerald-500" /> generation
          </span>
        </div>
      </div>

      {window.length === 0 ? (
        <div className="mt-3 flex h-[120px] items-center justify-center text-xs opacity-50">No requests yet.</div>
      ) : (
        <>
          <div className="mt-3 flex gap-2">
            {/* Y axis labels (HTML, not SVG → no stretching) */}
            <div className="relative w-10 shrink-0 text-right font-mono text-[10px] leading-none opacity-50" style={{ height: CHART_HEIGHT }}>
              {ticks
                .slice()
                .reverse()
                .map((f) => (
                  <span
                    key={f}
                    className="absolute right-0"
                    style={{ top: `${(1 - f) * CHART_HEIGHT - 5}px` }}
                  >
                    {(maxY * f).toFixed(0)}
                  </span>
                ))}
            </div>

            {/* Chart: gridlines + polylines, no text */}
            <div className="relative flex-1">
              <svg
                viewBox={`0 0 ${svgWidth} ${CHART_HEIGHT}`}
                preserveAspectRatio="none"
                className="block w-full"
                style={{ height: CHART_HEIGHT }}
              >
                {ticks.map((f) => {
                  const y = CHART_HEIGHT - f * CHART_HEIGHT;
                  return (
                    <line
                      key={f}
                      x1={0}
                      x2={svgWidth}
                      y1={y}
                      y2={y}
                      stroke="currentColor"
                      strokeOpacity={f === 0 ? 0.3 : 0.08}
                      strokeWidth={0.5}
                      vectorEffect="non-scaling-stroke"
                    />
                  );
                })}
                <path
                  fill="none"
                  stroke="#0ea5e9"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                  d={pathFor(promptSeries)}
                />
                <path
                  fill="none"
                  stroke="#10b981"
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                  d={pathFor(genSeries)}
                />
              </svg>
            </div>
          </div>
          <div className="mt-1 pl-12 text-[10px] opacity-50">last {window.length} requests</div>
        </>
      )}
    </section>
  );
}
