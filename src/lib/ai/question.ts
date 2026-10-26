import { z } from "zod";
import type { SourcedMetric } from "../sources/types";
import { addDays, daysBetween } from "../util/dates";
import { ANALYSIS_TYPES, type AnalysisRequest } from "../analysis/explore";
import { MAX_LAG_DAYS } from "../analysis/investigate";
import { askStructured } from "./client";

/**
 * 店の人の質問を読み取る。質問は2種類:
 * - 数字が動いた理由 (「先週、注文が落ちたのはなぜ？」): 調べる数字・変化の期間・比べる期間と、原因の候補から外す数字
 *   (調べる数字から計算されるもの、その一部、あとから決まるもの) を決める
 * - それ以外のデータについての質問 (「周期はある？」「広告と注文は関係ある？」): 行う分析を、決まった種類から選ぶ
 * 答えはコードで確かめ、通らなければ理由を添えて一度だけ聞き直す
 */

export type QuestionPlan = {
  target: string;
  change: { start: string; end: string };
  baseline: { start: string; end: string };
  excluded: { metric: string; reason: string }[];
};

/** 変化の理由ではない質問で行う分析 (1〜4個) */
export type ExplorePlan = { kind: "explore"; analyses: AnalysisRequest[] };

export type QuestionReading =
  | { kind: "change"; plan: QuestionPlan }
  | { kind: "explore"; plan: ExplorePlan }
  | { kind: "unanswerable"; reason: string };

/** 一度に行う分析の数の上限 */
const MAX_ANALYSES = 4;

function schemaFor(metricKeys: [string, ...string[]]) {
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD");
  return z.object({
    kind: z.enum(["change", "explore", "unanswerable"]),
    not_answerable_reason: z.string().describe("Why it cannot be answered, in the shop owner's language. Empty unless kind is unanswerable."),
    analyses: z
      .array(
        z.object({
          type: z.enum(ANALYSIS_TYPES),
          metric: z.enum(metricKeys),
          other: z.string().describe("For correlation: the other number's key. Otherwise empty."),
          start: z.string().describe("For summary and extremes: YYYY-MM-DD, or empty for all data"),
          end: z.string().describe("For summary and extremes: YYYY-MM-DD, or empty for all data"),
        }),
      )
      .describe("Only for kind explore. Empty otherwise."),
    target: z.enum(metricKeys).describe("The number whose change the owner asks about"),
    change_start: date,
    change_end: date,
    baseline_start: date,
    baseline_end: date,
    excluded: z
      .array(z.object({ metric: z.enum(metricKeys), reason: z.string().describe("One short sentence in the shop owner's language") }))
      .describe("Numbers that cannot be causes of the target. Do not list the target itself."),
  });
}

type Context = {
  question: string;
  locale: Locale;
  shopName: string;
  timezone: string;
  today: string;
  metrics: SourcedMetric[];
  /** 数字ごとの、値がある最後の日 */
  lastDates: Map<string, string>;
  dataStart: string;
};

function systemPrompt(context: Context) {
  const metricLines = context.metrics
    .map(
      (m) =>
        `- ${m.key} (${m.source}; ${m.aggregation === "sum" ? "daily total" : "daily average"}; unit ${m.unit}; data until ${context.lastDates.get(m.key)}): ${m.description}`,
    )
    .join("\n");
  return `You help the owner of "${context.shopName}" understand their daily numbers. Another program computes everything; your job is only to read the question and decide what to compute.

Today is ${context.today} (${context.timezone}). Daily data starts on ${context.dataStart}.

The shop's numbers:
${metricLines}

First choose kind:
- change: the owner asks why a number went up or down, or what caused a change in some days. Then fill target and the periods below.
- explore: any other question about the shop's numbers (patterns, cycles, relationships, trends, totals, best or worst days). Then choose analyses below.
- unanswerable: the question is not about the shop's data at all.

For kind change, decide:
1. target: the number the owner asks about.
2. change period: the days the owner points at. Read relative dates in the shop's time zone. "Last week" means the most recent full Monday-to-Sunday week before today. "Yesterday" is one day. If no period is given, use the 7 days ending on the last day the target has data.
3. baseline period: the days to compare with. It must have the same number of days as the change period and end before it starts. Use the period the owner names ("compared with the same week last month", "vs the week before"); otherwise use the days right before the change period.
4. excluded: numbers that cannot be causes of the target, because they are computed from the target, are a part of it, or are decided after it (for example, when the target is orders: revenue, customers counted from those orders, and orders that the ad platform attributes to ads). Keep numbers that could plausibly drive the target, even if they are correlated with it. When the target is not orders, think the same way for that target.

The change period must end on or before the target's last data date, and the baseline must start on or after ${addDays(context.dataStart, MAX_LAG_DAYS)}.
For kind explore, choose 1 to ${MAX_ANALYSES} analyses that together answer the question:
- summary (metric, optional start/end): days, total, mean, lowest and highest day.
- weekday (metric): average for each day of the week over all data.
- cycles (metric): autocorrelation after removing the long-term trend, for 1 to 35 days; finds repeating cycles such as weekly or monthly.
- trend (metric): the long-term slope per year, and the first quarter vs the last quarter of the data.
- correlation (metric, other): how metric moves with other, with other shifted 0 to 7 days earlier.
- extremes (metric, optional start/end): the highest and lowest days.
If the owner does not name a number, use the shop's main numbers (such as orders).

For kinds other than change, fill target and the period fields with any valid values; they are ignored.
For kind unanswerable, explain why in not_answerable_reason.
Write every reason in English.`;
}

function checkAnalyses(analyses: z.infer<ReturnType<typeof schemaFor>>["analyses"], context: Context): string[] {
  const problems: string[] = [];
  const keys = new Set(context.metrics.map((m) => m.key));
  if (analyses.length === 0 || analyses.length > MAX_ANALYSES) problems.push(`Choose 1 to ${MAX_ANALYSES} analyses.`);
  for (const a of analyses) {
    if (a.type === "correlation" && (!keys.has(a.other) || a.other === a.metric)) problems.push(`correlation of ${a.metric} needs another valid number in other.`);
    for (const date of [a.start, a.end]) {
      if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) problems.push(`${date} is not YYYY-MM-DD.`);
    }
    if (a.start && a.end && a.start > a.end) problems.push(`start ${a.start} is after end ${a.end}.`);
  }
  return problems;
}

function check(answer: z.infer<ReturnType<typeof schemaFor>>, context: Context): string[] {
  const problems: string[] = [];
  const last = context.lastDates.get(answer.target)!;
  const earliest = addDays(context.dataStart, MAX_LAG_DAYS);
  const changeDays = daysBetween(answer.change_start, answer.change_end) + 1;
  const baselineDays = daysBetween(answer.baseline_start, answer.baseline_end) + 1;
  if (changeDays < 1) problems.push("change_end is before change_start.");
  if (baselineDays !== changeDays) problems.push(`The baseline has ${baselineDays} days but the change period has ${changeDays}.`);
  if (answer.baseline_end >= answer.change_start) problems.push("The baseline must end before the change period starts.");
  if (answer.change_end > last) problems.push(`${answer.target} has data only until ${last}.`);
  if (answer.baseline_start < earliest) problems.push(`The baseline must start on or after ${earliest}.`);
  if (answer.excluded.some((e) => e.metric === answer.target)) problems.push("Do not list the target in excluded.");
  return problems;
}

export async function readQuestion(env: AppEnv, context: Context): Promise<QuestionReading> {
  const keys = context.metrics.map((m) => m.key) as [string, ...string[]];
  const schema = schemaFor(keys);
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: systemPrompt(context) },
    { role: "user", content: context.question },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    const answer = await askStructured(env, { name: "question_reading", schema, messages, effort: "low", maxTokens: 6000 });
    if (answer.kind === "unanswerable") return { kind: "unanswerable", reason: answer.not_answerable_reason };
    if (answer.kind === "explore") {
      const problems = checkAnalyses(answer.analyses, context);
      if (problems.length === 0) {
        const analyses = answer.analyses.map((a) => ({ type: a.type, metric: a.metric, other: a.other || null, start: a.start || null, end: a.end || null }));
        return { kind: "explore", plan: { kind: "explore", analyses } };
      }
      messages.push({ role: "assistant", content: JSON.stringify(answer) }, { role: "user", content: `Please fix these problems:\n- ${problems.join("\n- ")}` });
      continue;
    }
    const problems = check(answer, context);
    if (problems.length === 0) {
      return {
        kind: "change",
        plan: {
          target: answer.target,
          change: { start: answer.change_start, end: answer.change_end },
          baseline: { start: answer.baseline_start, end: answer.baseline_end },
          excluded: answer.excluded,
        },
      };
    }
    messages.push({ role: "assistant", content: JSON.stringify(answer) }, { role: "user", content: `Please fix these problems:\n- ${problems.join("\n- ")}` });
  }
  throw new Error("質問を読み取れませんでした (2回とも確かめに通らなかった)");
}
