import { useTranslation } from "react-i18next";
import type { AnalysisResult } from "@/lib/analysis/explore";
import { METRIC_BY_KEY } from "@/lib/sources/definitions";
import { formatDate, formatValue, metricLabel } from "./format";

/** 縦の棒を並べる。threshold があれば、その高さ (±) に偶然の目安の線を引く */
function Bars({
  values,
  labels,
  format,
  highlight,
  threshold,
}: {
  values: number[];
  labels: string[];
  format: (v: number) => string;
  highlight?: (index: number) => boolean;
  threshold?: number;
}) {
  const max = Math.max(...values.map(Math.abs), threshold ?? 0) || 1;
  const signed = values.some((v) => v < 0);
  const height = 140;
  const zero = signed ? height / 2 : height;
  const scale = (v: number) => (Math.abs(v) / max) * (signed ? height / 2 : height);
  // ラベルが多いときは間引く
  const every = labels.length > 14 ? 5 : 1;
  return (
    <div>
      <div className="relative flex items-stretch gap-[2px]" style={{ height }}>
        {threshold !== undefined && (
          <>
            <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-black/30" style={{ top: zero - scale(threshold) }} />
            {signed && <div className="pointer-events-none absolute inset-x-0 border-t border-dashed border-black/30" style={{ top: zero + scale(threshold) }} />}
          </>
        )}
        {signed && <div className="pointer-events-none absolute inset-x-0 border-t border-black/20" style={{ top: zero }} />}
        {values.map((v, i) => (
          <div key={i} className="group relative flex-1" title={`${labels[i]}: ${format(v)}`}>
            <div
              className={`absolute inset-x-0 rounded-[3px] ${highlight?.(i) ? "bg-accent" : "bg-accent/35"} group-hover:bg-accent`}
              style={v >= 0 ? { bottom: height - zero, height: scale(v) } : { top: zero, height: scale(v) }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[2px] text-[11px] text-black/50">
        {labels.map((label, i) => (
          <span key={i} className="flex-1 text-center whitespace-nowrap">
            {i % every === 0 ? label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dd className="num text-2xl font-semibold tracking-tight">{value}</dd>
      <dt className="mt-0.5 text-xs text-black/50">{label}</dt>
    </div>
  );
}

/** 変化の理由ではない質問の答え。AI の答えの下に、計算した分析をそれぞれ図で出す */
export function ExploreDetail({ results, answer }: { results: AnalysisResult[]; answer: string }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  // 2024-01-01 は月曜
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + i))),
  );

  return (
    <>
      <p className="py-2 text-base leading-7">{answer}</p>
      {results.map(({ request, output }, index) => {
        const metric = METRIC_BY_KEY.get(request.metric)!;
        const name = metricLabel(request.metric, locale);
        const fmt = (v: number) => formatValue(v, metric.unit, locale);
        const period = `${formatDate(output.start, locale)} – ${formatDate(output.end, locale)}`;
        let title: string;
        let body: React.ReactNode;
        switch (output.type) {
          case "summary":
            title = t("explore.summary", { metric: name });
            body = (
              <dl className="flex flex-wrap gap-x-10 gap-y-4">
                {metric.aggregation === "sum" && <Stat label={t("explore.total")} value={fmt(output.total)} />}
                <Stat label={t("explore.mean")} value={fmt(output.mean)} />
                <Stat label={t("explore.max", { date: formatDate(output.max.date, locale) })} value={fmt(output.max.value)} />
                <Stat label={t("explore.min", { date: formatDate(output.min.date, locale) })} value={fmt(output.min.value)} />
              </dl>
            );
            break;
          case "weekday": {
            const top = output.means.indexOf(Math.max(...output.means));
            title = t("explore.weekday", { metric: name });
            body = <Bars values={output.means} labels={weekdays} format={fmt} highlight={(i) => i === top} />;
            break;
          }
          case "cycles":
            title = t("explore.cycles", { metric: name });
            body = (
              <>
                <Bars
                  values={output.autocorrelation}
                  labels={output.autocorrelation.map((_, i) => String(i + 1))}
                  format={(v) => v.toFixed(2)}
                  highlight={(i) => output.peaks.some((p) => p.days === i + 1)}
                  threshold={output.threshold}
                />
                <p className="mt-2 text-xs text-black/50">{t("explore.cyclesAxis")}</p>
              </>
            );
            break;
          case "trend":
            title = t("explore.trend", { metric: name });
            body = (
              <dl className="flex flex-wrap gap-x-10 gap-y-4">
                <Stat label={t("explore.firstQuarter")} value={fmt(output.firstQuarterMean)} />
                <Stat label={t("explore.lastQuarter")} value={fmt(output.lastQuarterMean)} />
                <Stat label={t("explore.perYear")} value={formatValue(output.perYear, metric.unit, locale, { signed: true })} />
              </dl>
            );
            break;
          case "correlation": {
            const other = request.other ? metricLabel(request.other, locale) : "";
            const best = output.byLag.reduce((a, b) => (Math.abs(b.r) > Math.abs(a.r) ? b : a));
            title = t("explore.correlation", { metric: name, other });
            body = (
              <>
                <Bars
                  values={output.byLag.map((l) => l.r)}
                  labels={output.byLag.map((l) => t("explore.lag", { count: l.lag }))}
                  format={(v) => v.toFixed(2)}
                  highlight={(i) => i === best.lag}
                  threshold={output.threshold}
                />
                <p className="mt-2 text-xs text-black/50">{t("explore.correlationAxis", { other })}</p>
              </>
            );
            break;
          }
          case "extremes":
            title = t("explore.extremes", { metric: name });
            body = (
              <div className="grid gap-6 sm:grid-cols-2">
                {(["highest", "lowest"] as const).map((key) => (
                  <div key={key}>
                    <p className="text-xs font-semibold text-black/50">{t(`explore.${key}`)}</p>
                    <ol className="mt-2 space-y-1 text-sm">
                      {output[key].map((p) => (
                        <li key={p.date} className="flex justify-between gap-3 border-b border-black/10 py-1">
                          <span className="text-black/70">{formatDate(p.date, locale)}</span>
                          <span className="num font-semibold">{fmt(p.value)}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </div>
            );
            break;
        }
        return (
          <section key={index} className="border-t border-black/10 pt-5 pb-2">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4">
              <h2 className="text-sm font-semibold">{title}</h2>
              <span className="text-xs text-black/50">{period}</span>
            </div>
            {body}
          </section>
        );
      })}
    </>
  );
}
