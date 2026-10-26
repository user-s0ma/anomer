import { addDays } from "@/lib/util/dates";
import { formatDate, formatValue } from "./format";

const WIDTH = 720;
const HEIGHT = 220;
const PAD = { top: 12, right: 12, bottom: 26, left: 48 };

/**
 * 調べた数字の日別の値 (実際とモデル) と、変化の期間・比べた期間の帯
 */
export function SeriesChart({
  series,
  change,
  baseline,
  unit,
  locale,
  labels,
}: {
  series: { date: string; actual: number; fitted: number }[];
  change: { start: string; end: string };
  baseline: { start: string; end: string };
  unit: string;
  locale: Locale;
  labels: { actual: string; fitted: string; change: string; baseline: string };
}) {
  // 比べた期間の3週間前から、変化の期間の終わりまで
  const from = addDays(baseline.start, -21);
  const shown = series.filter((p) => p.date >= from && p.date <= change.end);
  if (shown.length < 2) return null;
  const values = shown.flatMap((p) => [p.actual, p.fitted]);
  const lo = Math.min(0, ...values);
  const hi = Math.max(...values) * 1.08 || 1;
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const xi = (i: number) => PAD.left + (i / (shown.length - 1)) * innerW;
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * innerH;
  const indexOf = (date: string) => shown.findIndex((p) => p.date === date);
  const band = (period: { start: string; end: string }) => {
    const a = indexOf(period.start);
    const b = indexOf(period.end);
    if (a < 0 || b < 0) return null;
    const half = innerW / (shown.length - 1) / 2;
    return { x: xi(a) - half, w: xi(b) - xi(a) + half * 2 };
  };
  const changeBand = band(change);
  const baselineBand = band(baseline);
  const path = (key: "actual" | "fitted") => shown.map((p, i) => `${i === 0 ? "M" : "L"}${xi(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join("");
  const ticks = [lo, (lo + hi) / 2, hi];
  const dateTicks = [0, Math.floor((shown.length - 1) / 2), shown.length - 1];

  return (
    <figure>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full" role="img" aria-label={labels.actual}>
        {baselineBand && <rect x={baselineBand.x} y={PAD.top} width={baselineBand.w} height={innerH} className="fill-sunken" />}
        {changeBand && <rect x={changeBand.x} y={PAD.top} width={changeBand.w} height={innerH} className="fill-accent-tint" />}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(v)} y2={y(v)} className="stroke-line" />
            <text x={PAD.left - 6} y={y(v) + 4} textAnchor="end" className="fill-ink-mute text-[11px]">
              {formatValue(v, unit, locale)}
            </text>
          </g>
        ))}
        {dateTicks.map((i) => (
          <text key={i} x={xi(i)} y={HEIGHT - 8} textAnchor={i === 0 ? "start" : i === shown.length - 1 ? "end" : "middle"} className="fill-ink-mute text-[11px]">
            {formatDate(shown[i].date, locale)}
          </text>
        ))}
        <path d={path("fitted")} fill="none" className="stroke-ink-mute" strokeWidth={1.5} strokeDasharray="4 3" />
        <path d={path("actual")} fill="none" className="stroke-ink" strokeWidth={2} strokeLinejoin="round" />
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-soft">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 bg-ink" />
          {labels.actual}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0 w-4 border-t-2 border-dashed border-ink-mute" />
          {labels.fitted}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-accent-tint" />
          {labels.change}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm bg-sunken" />
          {labels.baseline}
        </span>
      </figcaption>
    </figure>
  );
}
