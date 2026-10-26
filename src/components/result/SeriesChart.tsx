import { useEffect, useId, useRef, useState } from "react";
import { addDays } from "@/lib/util/dates";
import { formatDate, formatValue } from "./format";

const HEIGHT = 280;
const PAD = { top: 28, right: 16, bottom: 28, left: 52 };

/** 目盛りの間隔を 1・2・5 × 10^n にそろえる */
export function niceStep(range: number, count: number) {
  const raw = range / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const unit = raw / power;
  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * power;
}

/**
 * 調べた数字の日別の値 (実際とモデル) と、変化の期間・比べた期間の帯。
 * 帯の上に期間の名前、帯の中にその期間の1日平均を引く。指した日の値を出す
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
  labels: { actual: string; fitted: string; change: string; baseline: string; average: string };
}) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);
  // 文字の大きさを保つため、拡大縮小せずに枠の幅で描く
  const frame = useRef<HTMLDivElement>(null);
  const [WIDTH, setWidth] = useState(720);
  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // 比べた期間の3週間前から、変化の期間の終わりまで
  const from = addDays(baseline.start, -21);
  const shown = series.filter((p) => p.date >= from && p.date <= change.end);
  if (shown.length < 2) return null;

  const values = shown.flatMap((p) => [p.actual, p.fitted]);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const step = niceStep(max - Math.min(0, min) || 1, 4);
  const lo = Math.min(0, Math.floor(min / step) * step);
  const hi = Math.ceil(max / step) * step || step;
  const ticks = Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => lo + i * step);

  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const slot = innerW / (shown.length - 1);
  const xi = (i: number) => PAD.left + i * slot;
  const y = (v: number) => PAD.top + (1 - (v - lo) / (hi - lo)) * innerH;
  const indexOf = (date: string) => shown.findIndex((p) => p.date === date);

  const periods = [
    { key: "baseline", label: labels.baseline, ...baseline },
    { key: "change", label: labels.change, ...change },
  ].flatMap((period) => {
    const a = indexOf(period.start);
    const b = indexOf(period.end);
    if (a < 0 || b < 0) return [];
    const days = shown.slice(a, b + 1);
    const mean = days.reduce((s, p) => s + p.actual, 0) / days.length;
    return [{ ...period, x: Math.max(PAD.left, xi(a) - slot / 2), x2: Math.min(WIDTH - PAD.right, xi(b) + slot / 2), mean }];
  });

  const line = (key: "actual" | "fitted") => shown.map((p, i) => `${i === 0 ? "M" : "L"}${xi(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join("");
  const area = `${line("actual")}L${xi(shown.length - 1).toFixed(1)},${y(lo).toFixed(1)}L${xi(0).toFixed(1)},${y(lo).toFixed(1)}Z`;
  // 日付の目盛りは、変化の期間の始まりから1週間ずつ
  const anchor = Math.max(0, indexOf(change.start));
  const dateTicks = shown.map((_, i) => i).filter((i) => (i - anchor) % 7 === 0);
  const last = shown.length - 1;
  const point = hover === null ? null : shown[hover];

  const pick = (clientX: number, rect: DOMRect) => {
    const x = ((clientX - rect.left) / rect.width) * WIDTH;
    setHover(Math.max(0, Math.min(last, Math.round((x - PAD.left) / slot))));
  };

  return (
    <figure>
      <div ref={frame} className="relative">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          width={WIDTH}
          height={HEIGHT}
          className="block touch-none select-none outline-none"
          role="img"
          aria-label={labels.actual}
          tabIndex={0}
          onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerLeave={() => setHover(null)}
          onBlur={() => setHover(null)}
          onKeyDown={(e) => {
            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
            e.preventDefault();
            setHover((h) => Math.max(0, Math.min(last, (h ?? last) + (e.key === "ArrowRight" ? 1 : -1))));
          }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" style={{ stopColor: "var(--color-accent)" }} stopOpacity={0.28} />
              <stop offset="100%" style={{ stopColor: "var(--color-accent)" }} stopOpacity={0} />
            </linearGradient>
          </defs>

          {periods.map((p) => (
            <g key={p.key}>
              <rect
                x={p.x}
                y={PAD.top}
                width={p.x2 - p.x}
                height={innerH}
                className={p.key === "change" ? "fill-accent/10" : "fill-black/[0.04]"}
              />
              <text x={p.x + 6} y={PAD.top - 9} className="fill-black/60 text-[11px] font-medium">
                {p.label}
              </text>
            </g>
          ))}

          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(v)} y2={y(v)} className="stroke-black/10" />
              <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" className="num fill-black/50 text-[11px]">
                {formatValue(v, unit, locale)}
              </text>
            </g>
          ))}
          {dateTicks.map((i) => (
            <text key={i} x={xi(i)} y={HEIGHT - 8} textAnchor="middle" className="fill-black/50 text-[11px]">
              {formatDate(shown[i].date, locale)}
            </text>
          ))}

          <path d={area} fill={`url(#${gradientId})`} />
          <path d={line("fitted")} fill="none" className="stroke-black/45" strokeWidth={1.5} strokeDasharray="4 4" strokeLinecap="round" />
          <path d={line("actual")} fill="none" className="stroke-accent" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

          {/* 期間ごとの1日平均 */}
          {periods.map((p) => (
            <g key={p.key}>
              <line x1={p.x + 4} x2={p.x2 - 4} y1={y(p.mean)} y2={y(p.mean)} className="stroke-black" strokeWidth={1.5} strokeLinecap="round" />
              <text
                x={p.x2 - 6}
                y={y(p.mean) - 7}
                textAnchor="end"
                strokeWidth={4}
                strokeLinejoin="round"
                className="num fill-black stroke-white text-xs font-semibold [paint-order:stroke]"
              >
                {formatValue(p.mean, unit, locale)}
              </text>
            </g>
          ))}

          {hover === null || point === null ? (
            <circle cx={xi(last)} cy={y(shown[last].actual)} r={4} className="fill-accent stroke-white" strokeWidth={2} />
          ) : (
            <g>
              <line x1={xi(hover)} x2={xi(hover)} y1={PAD.top} y2={PAD.top + innerH} className="stroke-black/30" />
              <circle cx={xi(hover)} cy={y(point.fitted)} r={3.5} className="fill-black/45 stroke-white" strokeWidth={2} />
              <circle cx={xi(hover)} cy={y(point.actual)} r={4.5} className="fill-accent stroke-white" strokeWidth={2} />
            </g>
          )}
        </svg>

        {hover !== null && point !== null && (
          <div
            className="pointer-events-none absolute top-0 z-10 min-w-36 rounded-lg border border-black/10 bg-white px-3 py-2 text-xs shadow-lg"
            style={
              hover > last / 2
                ? { right: `${100 - (xi(hover) / WIDTH) * 100}%`, marginRight: 10 }
                : { left: `${(xi(hover) / WIDTH) * 100}%`, marginLeft: 10 }
            }
          >
            <p className="mb-1 text-black/50">{formatDate(point.date, locale)}</p>
            <p className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-1.5 text-black/60">
                <span className="h-0.5 w-3 rounded-full bg-accent" />
                {labels.actual}
              </span>
              <span className="num font-semibold">{formatValue(point.actual, unit, locale)}</span>
            </p>
            <p className="flex items-center justify-between gap-4">
              <span className="inline-flex items-center gap-1.5 text-black/60">
                <span className="w-3 border-t-2 border-dashed border-black/45" />
                {labels.fitted}
              </span>
              <span className="num">{formatValue(point.fitted, unit, locale)}</span>
            </p>
          </div>
        )}
      </div>

      <figcaption className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-black/50">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full bg-accent" />
          {labels.actual}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed border-black/45" />
          {labels.fitted}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-[1.5px] w-4 rounded-full bg-black" />
          {labels.average}
        </span>
      </figcaption>
    </figure>
  );
}
