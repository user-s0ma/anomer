import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { PageBody } from "@/components/PageBody";
import { formatDate, formatValue } from "@/components/result/format";
import { getData } from "@/lib/api-client";

const DAYS = 90;

function Sparkline({ values }: { values: (number | null)[] }) {
  const points = values.map((v, i) => [i, v] as const).filter((p): p is readonly [number, number] => p[1] !== null);
  if (points.length < 2) return null;
  const ys = points.map((p) => p[1]);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const d = points
    .map(([i, v], k) => `${k === 0 ? "M" : "L"}${((i / (values.length - 1)) * 100).toFixed(2)},${(28 - ((v - lo) / (hi - lo || 1)) * 26).toFixed(2)}`)
    .join("");
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-8 w-full" aria-hidden>
      <path d={d} fill="none" className="stroke-black" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function Data() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const data = useQuery({ queryKey: ["data"], queryFn: getData });

  return (
    <PageBody title={t("data.title")}>
      {data.isPending ? (
        <p className="text-sm text-black/50">{t("common.loading")}</p>
      ) : data.isError ? (
        <p className="text-sm text-down">{t("common.error")}</p>
      ) : (
        <div className="space-y-4">
          <p className="pl-2 text-sm text-black/50">
            {t("data.dataUntil", { date: formatDate(data.data.dates[data.data.dates.length - 1], locale) })}
          </p>
          {data.data.sources.map((source) => (
            <section key={source.id} className="panel">
              <div className="panel-header">
                <h2 className="panel-title">
                  {source.label[locale]}
                  <span className="ml-2 text-xs font-normal text-black/50">
                    {source.kind === "live" ? t("data.live") : t("data.simulated")}
                  </span>
                </h2>
                <span className="truncate text-xs text-black/50">{source.modeledOn}</span>
              </div>
              <ul className="grid gap-x-6 gap-y-5 p-5 sm:grid-cols-2 lg:grid-cols-3">
                {data.data.metrics
                  .filter((m) => m.source === source.id)
                  .map((m) => {
                    const recent = m.values.slice(-DAYS);
                    const last = [...recent].reverse().find((v) => v !== null);
                    return (
                      <li key={m.key} className="min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="truncate text-sm font-medium">{m.label[locale]}</span>
                          {last !== undefined && last !== null && <span className="num text-sm text-black/50">{formatValue(last, m.unit, locale)}</span>}
                        </div>
                        <Sparkline values={recent} />
                        {m.latencyDays > 0 && <p className="text-xs text-black/50">{t("data.latency", { count: m.latencyDays })}</p>}
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))}
          <p className="pl-2 text-xs text-black/50">{t("data.lastDays")}</p>
        </div>
      )}
    </PageBody>
  );
}
