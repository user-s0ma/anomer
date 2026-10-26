import { z } from "zod";
import type { MetricDefinition } from "../sources/catalog";
import { addDays, daysBetween } from "../util/dates";
import { MAX_LAG_DAYS } from "../analysis/investigate";
import { askStructured } from "./client";

/**
 * 店の人の質問 (「先週、注文が落ちたのはなぜ？」) を読み取り、調べる数字・変化の期間・比べる期間を決める。
 * あわせて、原因の候補から外す数字 (調べる数字から計算されるもの、その一部、あとから決まるもの) を選ぶ。
 * 答えはコードで確かめ、通らなければ理由を添えて一度だけ聞き直す
 */

export type QuestionPlan = {
  target: string;
  change: { start: string; end: string };
  baseline: { start: string; end: string };
  excluded: { metric: string; reason: string }[];
};

export type QuestionReading = { answerable: true; plan: QuestionPlan } | { answerable: false; reason: string };

const LANGUAGE = { en: "English", ja: "Japanese" } as const;

function schemaFor(metricKeys: [string, ...string[]]) {
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD");
  return z.object({
    answerable: z.boolean().describe("false if the question is not about a change in one of the shop's numbers"),
    not_answerable_reason: z.string().describe("Why it cannot be answered, in the shop owner's language. Empty if answerable."),
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
  metrics: MetricDefinition[];
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
  return `You help the owner of "${context.shopName}" understand why one of their daily numbers changed. Another program will compute the breakdown; your job is only to read the question.

Today is ${context.today} (${context.timezone}). Daily data starts on ${context.dataStart}.

The shop's numbers:
${metricLines}

Decide:
1. target: the number the owner asks about.
2. change period: the days the owner points at. Read relative dates in the shop's time zone. "Last week" means the most recent full Monday-to-Sunday week before today. "Yesterday" is one day. If no period is given, use the 7 days ending on the last day the target has data.
3. baseline period: the days to compare with. It must have the same number of days as the change period and end before it starts. Use the period the owner names ("compared with the same week last month", "vs the week before"); otherwise use the days right before the change period.
4. excluded: numbers that cannot be causes of the target, because they are computed from the target, are a part of it, or are decided after it (for example, when the target is orders: revenue, customers counted from those orders, and orders that the ad platform attributes to ads). Keep numbers that could plausibly drive the target, even if they are correlated with it. When the target is not orders, think the same way for that target.

The change period must end on or before the target's last data date, and the baseline must start on or after ${addDays(context.dataStart, MAX_LAG_DAYS)}.
If the question is not about a change in one of these numbers, set answerable to false, explain why in the not_answerable_reason, and fill the other fields with any valid values.
Write every reason in ${LANGUAGE[context.locale]}.`;
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
    if (!answer.answerable) return { answerable: false, reason: answer.not_answerable_reason };
    const problems = check(answer, context);
    if (problems.length === 0) {
      return {
        answerable: true,
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
