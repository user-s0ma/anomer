import { formatValue } from "./format";

export type WaterfallRow = {
  key: string;
  label: string;
  /** 寄与 (前の行の終わりから足す量) */
  value: number;
  /** 95% の幅 */
  margin?: number;
  kind: "cause" | "unexplained";
};

/**
 * 変化の内訳を横向きの滝グラフで見せる。前の値から始め、原因ごとの寄与を順に足して後の値に着く。
 * 前と後は縦の線、寄与は浮いた棒、幅はひげで表す
 */
export function Waterfall({
  before,
  after,
  rows,
  unit,
  locale,
  labels,
}: {
  before: number;
  after: number;
  rows: WaterfallRow[];
  unit: string;
  locale: Locale;
  labels: { before: string; after: string };
}) {
  const bars = rows.map((row, i) => {
    const start = before + rows.slice(0, i).reduce((sum, r) => sum + r.value, 0);
    return { ...row, start, end: start + row.value };
  });
  const points = [before, after, ...bars.flatMap((b) => [b.start, b.end, b.end - (b.margin ?? 0), b.end + (b.margin ?? 0)])];
  const lo = Math.min(...points);
  const hi = Math.max(...points);
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.06;
  const min = lo - pad;
  const max = hi + pad;
  const x = (v: number) => `${((v - min) / (max - min)) * 100}%`;
  const fmt = (v: number, signed = false) => formatValue(v, unit, locale, { signed });

  const totalRow = (label: string, value: number) => (
    <div className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 py-1.5 sm:grid-cols-[minmax(0,12rem)_1fr_5.5rem]">
      <div className="truncate text-sm font-semibold">{label}</div>
      <div className="relative h-7">
        <div className="absolute inset-y-0 w-0.5 rounded bg-ink" style={{ left: x(value) }} />
      </div>
      <div className="num text-right text-sm font-semibold">{fmt(value)}</div>
    </div>
  );

  return (
    <div role="img" aria-label={`${labels.before} ${fmt(before)} → ${labels.after} ${fmt(after)}`}>
      {totalRow(labels.before, before)}
      {bars.map((bar) => {
        const left = Math.min(bar.start, bar.end);
        const right = Math.max(bar.start, bar.end);
        const color = bar.kind === "unexplained" ? "bg-unknown" : bar.value >= 0 ? "bg-up" : "bg-down";
        return (
          <div
            key={bar.key}
            className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 border-t border-line py-1.5 sm:grid-cols-[minmax(0,12rem)_1fr_5.5rem]"
          >
            <div className="truncate text-sm text-ink-soft" title={bar.label}>
              {bar.label}
            </div>
            <div className="relative h-7">
              {/* 前の行の終わりからの補助線 */}
              <div className="absolute inset-y-0 w-px bg-line-strong/50" style={{ left: x(bar.start) }} />
              <div
                className={`absolute top-1.5 h-4 rounded-sm ${color}`}
                style={{ left: x(left), width: `max(2px, calc(${x(right)} - ${x(left)}))` }}
              />
              {bar.margin !== undefined && bar.margin > 0 && (
                <div
                  className="absolute top-1/2 h-px bg-ink"
                  style={{ left: x(bar.end - bar.margin), width: `calc(${x(bar.end + bar.margin)} - ${x(bar.end - bar.margin)})` }}
                >
                  <span className="absolute -top-1.5 left-0 h-3 w-px bg-ink" />
                  <span className="absolute -top-1.5 right-0 h-3 w-px bg-ink" />
                </div>
              )}
            </div>
            <div className={`num text-right text-sm font-medium ${bar.kind === "unexplained" ? "text-ink-mute" : bar.value >= 0 ? "text-up" : "text-down"}`}>
              {fmt(bar.value, true)}
            </div>
          </div>
        );
      })}
      <div className="border-t border-line">{totalRow(labels.after, after)}</div>
    </div>
  );
}
