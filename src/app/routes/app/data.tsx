import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { formatValue } from "@/components/result/format";
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
      <path d={d} fill="none" className="stroke-accent" strokeWidth={1.2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function Data() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const data = useQuery({ queryKey: ["data"], queryFn: getData });
  if (data.isPending) return <p className="text-sm text-ink-mute">{t("common.loading")}</p>;
  if (data.isError) return <p className="text-sm text-danger">{t("common.error")}</p>;
  const { sources, metrics } = data.data;

  return (
    <div>
      <h1 className="text-2xl font-bold">{t("data.title")}</h1>
      <p className="mt-1 text-sm text-ink-soft">{t("data.lead")}</p>
      <div className="mt-6 flex flex-col gap-6">
        {sources.map((source) => (
          <section key={source.id} className="rounded-xl border border-line bg-surface p-5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-lg font-semibold">{source.label[locale]}</h2>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${source.kind === "live" ? "bg-up-tint text-up" : "bg-sunken text-ink-soft"}`}
              >
                {source.kind === "live" ? t("data.live") : t("data.simulated")}
              </span>
              <span className="text-xs text-ink-mute">{t("data.modeledOn", { api: source.modeledOn })}</span>
            </div>
            <ul className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
              {metrics
                .filter((m) => m.source === source.id)
                .map((m) => {
                  const recent = m.values.slice(-DAYS);
                  const last = [...recent].reverse().find((v) => v !== null);
                  return (
                    <li key={m.key} className="min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium">{m.label[locale]}</span>
                        {last !== undefined && last !== null && <span className="num text-sm text-ink-soft">{formatValue(last, m.unit, locale)}</span>}
                      </div>
                      <Sparkline values={recent} />
                      <p className="line-clamp-2 text-xs text-ink-mute">
                        {m.description}
                        {m.latencyDays > 0 && ` ${t("data.latency", { count: m.latencyDays })}`}
                      </p>
                    </li>
                  );
                })}
            </ul>
          </section>
        ))}
        <p className="text-xs text-ink-mute">{t("data.lastDays")}</p>
      </div>
    </div>
  );
}
