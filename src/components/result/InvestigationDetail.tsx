import { useTranslation } from "react-i18next";
import type { InvestigationView } from "@/lib/api-client";
import { METRIC_BY_KEY } from "@/lib/sources/catalog";
import { columnLabel, formatPeriod, formatValue, groupLabel, metricLabel } from "./format";
import { SeriesChart } from "./SeriesChart";
import { Waterfall } from "./Waterfall";

export function InvestigationDetail({ investigation }: { investigation: InvestigationView }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { plan, result, explanation } = investigation;

  if (investigation.status === "failed" || !plan || !result || !explanation) {
    return (
      <section className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-lg font-semibold">{investigation.question}</h2>
        <p className="mt-3 text-sm text-danger">{investigation.error ?? t("app.failed")}</p>
      </section>
    );
  }

  const target = METRIC_BY_KEY.get(plan.target)!;
  const unit = target.unit;
  const fmt = (v: number, signed = false) => formatValue(v, unit, locale, { signed });
  const titleOf = new Map(explanation.groups.map((g) => [g.key, g]));

  return (
    <article className="flex flex-col gap-5">
      <header className="rounded-xl border border-line bg-surface p-5">
        <h2 className="text-lg font-semibold leading-snug">{investigation.question}</h2>
        <p className="mt-1 text-sm text-ink-soft">
          {t("result.comparing", {
            target: metricLabel(plan.target, locale),
            change: formatPeriod(plan.change, locale),
            baseline: formatPeriod(plan.baseline, locale),
          })}
        </p>
        <dl className="mt-4 grid grid-cols-3 gap-3">
          {[
            [t("result.from"), fmt(result.baselineValue)],
            [t("result.to"), fmt(result.changeValue)],
            [t("result.change"), fmt(result.change, true)],
          ].map(([label, value], i) => (
            <div key={label} className="rounded-lg bg-sunken px-3 py-2">
              <dt className="text-xs text-ink-mute">{label}</dt>
              <dd className={`num mt-0.5 text-xl font-semibold ${i === 2 ? (result.change >= 0 ? "text-up" : "text-down") : ""}`}>{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-[15px] leading-relaxed">{explanation.summary}</p>
      </header>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-mute">{t("result.breakdown")}</h3>
        <Waterfall
          before={result.baselineValue}
          after={result.changeValue}
          unit={unit}
          locale={locale}
          labels={{ before: `${t("result.from")} · ${formatPeriod(plan.baseline, locale)}`, after: `${t("result.to")} · ${formatPeriod(plan.change, locale)}` }}
          rows={[
            ...result.groups.map((g) => ({
              key: g.key,
              label: titleOf.get(g.key)?.title ?? groupLabel(g.key, locale, t),
              value: g.contribution,
              margin: g.margin,
              kind: "cause" as const,
            })),
            { key: "unexplained", label: t("result.unexplained"), value: result.unexplained, kind: "unexplained" as const },
          ]}
        />
      </section>

      <section className="flex flex-col gap-3">
        {result.groups.map((group) => {
          const text = titleOf.get(group.key);
          const noisy = Math.abs(group.contribution) <= group.margin;
          return (
            <div key={group.key} className="rounded-xl border border-line bg-surface p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-ink-mute">{groupLabel(group.key, locale, t)}</p>
                  <h4 className="text-base font-semibold">{text?.title}</h4>
                </div>
                <div className="text-right">
                  <p className={`num text-lg font-semibold ${group.contribution >= 0 ? "text-up" : "text-down"}`}>{fmt(group.contribution, true)}</p>
                  <p className="num text-xs text-ink-mute">
                    {t("result.range", { margin: fmt(group.margin) })}
                    {noisy && ` · ${t("result.mayBeNoise")}`}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ink-soft">{text?.explanation}</p>
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-ink-mute hover:text-ink">{t("result.details")}</summary>
                <ul className="mt-2 divide-y divide-line">
                  {group.columns.map((c, i) => (
                    <li key={i} className="flex justify-between gap-3 py-1.5">
                      <span className="text-ink-soft">{columnLabel(c.column, locale, t)}</span>
                      <span className="num">{fmt(c.contribution, true)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          );
        })}
      </section>

      <section className="rounded-xl border border-line bg-surface p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-mute">{t("result.chartTitle", { target: metricLabel(plan.target, locale) })}</h3>
        <SeriesChart
          series={result.series}
          change={plan.change}
          baseline={plan.baseline}
          unit={unit}
          locale={locale}
          labels={{ actual: t("result.actual"), fitted: t("result.fitted"), change: t("result.changePeriod"), baseline: t("result.baselinePeriod") }}
        />
      </section>

      {(plan.excluded.length > 0 || result.unavailable.length > 0) && (
        <section className="grid gap-3 sm:grid-cols-2">
          {plan.excluded.length > 0 && (
            <div className="rounded-xl border border-line bg-surface p-5">
              <h3 className="text-sm font-semibold">{t("result.excludedTitle")}</h3>
              <p className="mt-1 text-xs text-ink-mute">{t("result.excludedNote", { target: metricLabel(plan.target, locale) })}</p>
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                {plan.excluded.map((e) => (
                  <li key={e.metric}>
                    <span className="font-medium">{metricLabel(e.metric, locale)}</span>
                    <span className="text-ink-soft"> — {e.reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {result.unavailable.length > 0 && (
            <div className="rounded-xl border border-line bg-surface p-5">
              <h3 className="text-sm font-semibold">{t("result.unavailableTitle")}</h3>
              <p className="mt-2 text-sm text-ink-soft">{result.unavailable.map((k) => metricLabel(k, locale)).join(", ")}</p>
            </div>
          )}
        </section>
      )}

      <details className="rounded-xl border border-line bg-surface p-5 text-sm">
        <summary className="cursor-pointer font-semibold">{t("result.method")}</summary>
        <p className="mt-2 leading-relaxed text-ink-soft">
          {t("result.methodBody", {
            rows: result.fit.rows,
            first: result.fit.firstDate,
            last: result.fit.lastDate,
            columns: result.fit.columns,
            folds: result.fit.folds,
            selected: result.fit.selected,
            r2: result.fit.rSquared.toFixed(2),
          })}
        </p>
      </details>
    </article>
  );
}
