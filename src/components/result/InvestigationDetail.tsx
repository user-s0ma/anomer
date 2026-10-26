import { useTranslation } from "react-i18next";
import type { InvestigationView } from "@/lib/api-client";
import { METRIC_BY_KEY } from "@/lib/sources/definitions";
import { columnLabel, formatPeriod, formatValue, groupLabel, metricLabel } from "./format";
import { SeriesChart } from "./SeriesChart";
import { Waterfall } from "./Waterfall";

export function InvestigationDetail({ investigation }: { investigation: InvestigationView }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { plan, result, explanation } = investigation;

  const question = (
    <p className="ml-auto w-fit max-w-[85%] rounded-3xl bg-black/10 px-4 py-2.5 text-sm leading-6">{investigation.question}</p>
  );

  if (investigation.status === "failed" || !plan || !result || !explanation) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {question}
        <p className="text-sm text-black/50">{investigation.error ?? t("app.failed")}</p>
      </div>
    );
  }

  const target = METRIC_BY_KEY.get(plan.target)!;
  const unit = target.unit;
  const fmt = (v: number, signed = false) => formatValue(v, unit, locale, { signed });
  const textOf = new Map(explanation.groups.map((g) => [g.key, g]));

  return (
    <article className="mx-auto flex max-w-3xl flex-col gap-4">
      {question}

      <div className="py-2">
        <p className="text-sm text-black/50">
          {t("result.comparing", {
            target: metricLabel(plan.target, locale),
            change: formatPeriod(plan.change, locale),
            baseline: formatPeriod(plan.baseline, locale),
          })}
        </p>
        <p className="num mt-1 flex flex-wrap items-baseline gap-x-3 text-3xl font-semibold tracking-tight">
          <span className="text-black/50">{fmt(result.baselineValue)}</span>
          <span className="text-black/50">→</span>
          <span>{fmt(result.changeValue)}</span>
          <span className={`text-xl ${result.change >= 0 ? "text-up" : "text-down"}`}>{fmt(result.change, true)}</span>
        </p>
        <p className="mt-4 text-base leading-7">{explanation.summary}</p>
      </div>

      {/* 内訳: 滝グラフの下に、同じパネルの中で原因ごとの説明を並べる。前と後の値は上の見出しにあるので滝グラフでは省く */}
      <section className="panel">
        <div className="panel-header">
          <h2 className="panel-title">{t("result.breakdown")}</h2>
        </div>
        <div className="px-5 py-3">
          <Waterfall
            before={result.baselineValue}
            after={result.changeValue}
            unit={unit}
            locale={locale}
            labels={{ before: formatPeriod(plan.baseline, locale), after: formatPeriod(plan.change, locale) }}
            showTotals={false}
            rows={[
              ...result.groups.map((g) => ({
                key: g.key,
                label: textOf.get(g.key)?.title ?? groupLabel(g.key, locale, t),
                value: g.contribution,
                margin: g.margin,
                kind: "cause" as const,
              })),
              { key: "unexplained", label: t("result.unexplained"), value: result.unexplained, kind: "unexplained" as const },
            ]}
          />        </div>
        <ul className="divide-y divide-black/20 border-t border-black/20">
          {result.groups.map((group) => {
            const text = textOf.get(group.key);
            const noisy = Math.abs(group.contribution) <= group.margin;
            return (
              <li key={group.key} className="px-5 py-4">
                <h3 className="font-semibold">{text?.title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-black/70">{text?.explanation}</p>
                {/* 原因の種類と「偶然かもしれない」は、くわしくの中に置く */}
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-xs text-black/50 hover:text-black">{t("result.details")}</summary>
                  <p className="mt-2 text-xs text-black/50">
                    {groupLabel(group.key, locale, t)}
                    {noisy && ` · ${t("result.mayBeNoise")}`}
                  </p>
                  <ul className="mt-1 space-y-1">
                    {group.columns.map((c, i) => (
                      <li key={i} className="flex justify-between gap-3 text-xs">
                        <span className="text-black/70">{columnLabel(c.column, locale, t)}</span>
                        <span className="num">{fmt(c.contribution, true)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="pt-2">
        <h2 className="mb-2 text-sm font-semibold">{t("result.chartTitle", { target: metricLabel(plan.target, locale) })}</h2>
        <SeriesChart
          series={result.series}
          change={plan.change}
          baseline={plan.baseline}
          unit={unit}
          locale={locale}
          labels={{ actual: t("result.actual"), fitted: t("result.fitted"), change: t("result.changePeriod"), baseline: t("result.baselinePeriod") }}
        />
      </div>

      {plan.excluded.length > 0 && (
        <p className="text-xs leading-5 text-black/50">
          {t("result.excludedTitle")}:{" "}
          {plan.excluded.map((e, i) => (
            <span key={e.metric}>
              {i > 0 && "; "}
              {metricLabel(e.metric, locale)} — {e.reason}
            </span>
          ))}
        </p>
      )}

      {result.unavailable.length > 0 && (
        <p className="text-xs text-black/50">
          {t("result.unavailableTitle")}: {result.unavailable.map((k) => metricLabel(k, locale)).join(", ")}
        </p>
      )}

      <details className="text-sm text-black/50">
        <summary className="cursor-pointer hover:text-black">{t("result.method")}</summary>
        <p className="mt-2 leading-6">
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
