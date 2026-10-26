import { z } from "zod";
import type { GroupKey, InvestigationResult } from "../analysis/investigate";
import { METRIC_BY_KEY, SOURCES } from "../sources/catalog";
import type { QuestionPlan } from "./question";
import { askStructured } from "./client";

/**
 * 計算した内訳に、AI が意味をつけて平易な言葉で説明する。数字はコードの結果だけを使わせる
 */

export type Explanation = {
  summary: string;
  groups: { key: GroupKey; title: string; explanation: string }[];
};

const LANGUAGE = { en: "English", ja: "Japanese" } as const;

const round = (value: number) => Math.round(value * 10) / 10;

/** AI に渡す内訳 (読みやすいように、名前と丸めた数字にする) */
export function describeResult(plan: QuestionPlan, result: InvestigationResult) {
  const target = METRIC_BY_KEY.get(plan.target)!;
  const sourceLabel = (id: string) => SOURCES.find((s) => s.id === id)?.label.en ?? id;
  return {
    target: { key: target.key, name: target.label.en, unit: target.unit, measured_as: target.aggregation === "sum" ? "total over the period" : "daily average" },
    change_period: plan.change,
    baseline_period: plan.baseline,
    baseline_value: round(result.baselineValue),
    change_value: round(result.changeValue),
    change: round(result.change),
    unexplained: round(result.unexplained),
    parts: result.groups.map((group) => ({
      key: group.key,
      kind:
        group.key === "trend"
          ? "long-term trend"
          : group.key === "dayOfWeek"
            ? "day of the week"
            : group.key === "dayOfMonth"
              ? "day of the month (recurring monthly peaks or dips found in the data)"
              : `data source: ${sourceLabel(group.key.slice("source:".length))}`,
      contribution: round(group.contribution),
      plus_minus_95: round(group.margin),
      columns: group.columns.map((c) => {
        const base = { contribution: round(c.contribution) };
        switch (c.column.type) {
          case "metric": {
            const metric = METRIC_BY_KEY.get(c.column.key)!;
            return {
              ...base,
              number: metric.label.en,
              days_earlier: c.column.lag,
              daily_average_in_change_period: round(c.changeValue),
              daily_average_in_baseline: round(c.baselineValue),
              unit: metric.unit,
            };
          }
          case "dayOfMonth":
            return { ...base, day_of_month: c.column.day, effect_per_occurrence: round(c.coefficient) };
          case "dayOfWeek":
            return { ...base, weekday: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][c.column.day], effect_per_day: round(c.coefficient) };
          case "trend":
            return { ...base, effect_per_year: round(c.coefficient) };
        }
      }),
    })),
    model: { r_squared: round(result.fit.rSquared * 100) / 100, days_used: result.fit.rows, first_day: result.fit.firstDate },
  };
}

export async function explain(env: AppEnv, input: { plan: QuestionPlan; result: InvestigationResult; question: string; locale: Locale; shopName: string }) {
  const keys = input.result.groups.map((g) => g.key) as [string, ...string[]];
  const schema = z.object({
    summary: z.string().describe("Two or three sentences that answer the owner's question"),
    groups: z.array(
      z.object({
        key: keys.length > 0 ? z.enum(keys) : z.string(),
        title: z.string().describe("A short name for this cause, e.g. 'Ads were paused' or 'Rainy days'"),
        explanation: z.string().describe("One or two sentences"),
      }),
    ),
  });

  const data = describeResult(input.plan, input.result);
  const answer = await askStructured(env, {
    name: "explanation",
    schema,
    effort: "medium",
    maxTokens: 12000,
    messages: [
      {
        role: "system",
        content: `You explain to the owner of "${input.shopName}" why one of their numbers changed. A statistical model has already split the change into parts. Each part is a group of columns the model kept: a data source (its numbers, shifted by 0 to 7 days), the day of the week, the day of the month, or the long-term trend. "contribution" is how much that part moved the target between the baseline and the change period, and "plus_minus_95" is its 95% range. "unexplained" is what the model could not attribute.

Rules:
- Use only the numbers given. You may round them, but do not compute new figures or invent causes that are not in the data.
- Give each part a short, concrete title and say what probably happened, based on which numbers moved and by how many days they lead the target (e.g. "ad spend dropped to $0, and orders follow ad spend by one day").
- Similar numbers inside one data source (such as views and reach) can split or cancel each other's contribution; describe the source as a whole.
- If a part's range includes zero, say it may be noise.
- A day-of-month part is a recurring monthly pattern. You may suggest what it could be (such as paydays) but say it is a guess.
- Write for a shop owner, not a statistician. Write in ${LANGUAGE[input.locale]}.
- Return one entry in groups for every part, using its key.`,
      },
      { role: "user", content: `Question: ${input.question}\n\nBreakdown:\n${JSON.stringify(data, null, 2)}` },
    ],
  });
  const missing = input.result.groups.filter((g) => !answer.groups.some((a) => a.key === g.key));
  if (missing.length > 0) throw new Error(`説明が足りません: ${missing.map((g) => g.key).join(", ")}`);
  return { summary: answer.summary, groups: answer.groups as Explanation["groups"] };
}
