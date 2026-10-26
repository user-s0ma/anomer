import { and, desc, eq, lt, sql } from "drizzle-orm";
import { runAnalysis, type AnalysisResult } from "../analysis/explore";
import { investigate, type InvestigationResult } from "../analysis/investigate";
import { answerExplore, explain, type Explanation } from "../ai/explain";
import { readQuestion, type ExplorePlan, type QuestionPlan } from "../ai/question";
import { getDb } from "../db/client";
import { investigation, usage } from "../db/schema";
import { loadSeries, syncShopData, type ShopRecord } from "../shop/service";
import { sourcedMetrics } from "../sources/definitions";
import { todayIn } from "../util/dates";

export type InvestigationStep = "data" | "reading" | "fitting" | "explaining";

type ViewBase = { id: string; question: string; status: "running" | "done" | "failed"; error: string | null; createdAt: string };

/**
 * 質問1つ。変化の理由を聞いたもの (change) は内訳と説明、それ以外 (explore) は分析の結果と答えを持つ。
 * 質問を読む前は、どちらか決まっていないので change として返す
 */
export type InvestigationView =
  | (ViewBase & { kind: "change"; plan: QuestionPlan | null; result: InvestigationResult | null; explanation: Explanation | null })
  | (ViewBase & { kind: "explore"; plan: ExplorePlan; results: AnalysisResult[] | null; answer: { summary: string } | null });

function toView(row: typeof investigation.$inferSelect): InvestigationView {
  const base = { id: row.id, question: row.question, status: row.status, error: row.error, createdAt: row.createdAt.toISOString() };
  const plan = row.plan ? (JSON.parse(row.plan) as QuestionPlan | ExplorePlan) : null;
  if (plan && "kind" in plan && plan.kind === "explore") {
    return {
      ...base,
      kind: "explore",
      plan,
      results: row.result ? (JSON.parse(row.result) as AnalysisResult[]) : null,
      answer: row.explanation ? (JSON.parse(row.explanation) as { summary: string }) : null,
    };
  }
  return {
    ...base,
    kind: "change",
    plan: plan as QuestionPlan | null,
    result: row.result ? (JSON.parse(row.result) as InvestigationResult) : null,
    explanation: row.explanation ? (JSON.parse(row.explanation) as Explanation) : null,
  };
}

export async function listInvestigations(env: AppEnv, userId: string) {
  const rows = await getDb(env)
    .select()
    .from(investigation)
    .where(eq(investigation.userId, userId))
    .orderBy(desc(investigation.createdAt))
    .limit(100);
  return rows.map(toView);
}

export async function getInvestigation(env: AppEnv, userId: string, id: string) {
  const [row] = await getDb(env)
    .select()
    .from(investigation)
    .where(and(eq(investigation.userId, userId), eq(investigation.id, id)))
    .limit(1);
  return row ? toView(row) : null;
}

/** 質問を1つ履歴から消す。消したら true */
export async function deleteInvestigation(env: AppEnv, userId: string, id: string) {
  const deleted = await getDb(env)
    .delete(investigation)
    .where(and(eq(investigation.userId, userId), eq(investigation.id, id)))
    .returning({ id: investigation.id });
  return deleted.length > 0;
}

/** 店の人に見せる失敗 (質問が読めないなど)。それ以外の失敗は中身を見せない */
export class UserFacingError extends Error {}

/**
 * 1回の調査を最後まで進める。途中の段階は onStep で知らせ、結果は DB に残す
 */
export async function runInvestigation(
  env: AppEnv,
  input: { shop: ShopRecord; question: string; locale: Locale },
  onStep: (step: InvestigationStep, id: string) => Promise<void>,
): Promise<InvestigationView> {
  const db = getDb(env);
  const id = crypto.randomUUID();
  const { shop } = input;
  await db.insert(investigation).values({ id, userId: shop.userId, question: input.question, locale: input.locale, status: "running" });

  try {
    await onStep("data", id);
    await syncShopData(env, shop);
    const { dates, values, sources } = await loadSeries(env, shop);
    // 候補になるのは、店がつないだデータ源の数字だけ
    const metrics = sourcedMetrics(sources);
    const lastDates = new Map(
      metrics.map((m) => {
        const list = values.get(m.key)!;
        let last = list.length - 1;
        while (last >= 0 && list[last] === null) last--;
        return [m.key, dates[last]];
      }),
    );

    await onStep("reading", id);
    const reading = await readQuestion(env, {
      question: input.question,
      locale: input.locale,
      shopName: shop.name,
      timezone: shop.timezone,
      today: todayIn(shop.timezone),
      metrics,
      lastDates,
      dataStart: shop.dataStart,
    });
    if (reading.kind === "unanswerable") throw new UserFacingError(reading.reason);
    if (reading.kind === "explore") {
      await db.update(investigation).set({ plan: JSON.stringify(reading.plan) }).where(eq(investigation.id, id));
      await onStep("fitting", id);
      const results = reading.plan.analyses.map((request) => ({ request, output: runAnalysis(dates, values, request) }));
      await db.update(investigation).set({ result: JSON.stringify(results) }).where(eq(investigation.id, id));
      await onStep("explaining", id);
      const answer = await answerExplore(env, { results, question: input.question, locale: input.locale, shopName: shop.name });
      await db
        .update(investigation)
        .set({ explanation: JSON.stringify(answer), status: "done", finishedAt: new Date() })
        .where(eq(investigation.id, id));
      return (await getInvestigation(env, shop.userId, id))!;
    }
    const { plan } = reading;
    await db.update(investigation).set({ plan: JSON.stringify(plan) }).where(eq(investigation.id, id));

    await onStep("fitting", id);
    const excluded = new Set([plan.target, ...plan.excluded.map((e) => e.metric)]);
    const target = metrics.find((m) => m.key === plan.target)!;
    const result = investigate({
      dates,
      target: { key: target.key, values: values.get(target.key)!, aggregation: target.aggregation },
      candidates: metrics.filter((m) => !excluded.has(m.key)).map((m) => ({ key: m.key, group: m.source, values: values.get(m.key)! })),
      change: plan.change,
      baseline: plan.baseline,
    });
    await db.update(investigation).set({ result: JSON.stringify(result) }).where(eq(investigation.id, id));

    await onStep("explaining", id);
    const explanation = await explain(env, { plan, result, question: input.question, locale: input.locale, shopName: shop.name });
    await db
      .update(investigation)
      .set({ explanation: JSON.stringify(explanation), status: "done", finishedAt: new Date() })
      .where(eq(investigation.id, id));
  } catch (error) {
    console.error("調査が止まりました:", id, error);
    const message = error instanceof UserFacingError ? error.message : null;
    await db.update(investigation).set({ status: "failed", error: message, finishedAt: new Date() }).where(eq(investigation.id, id));
  }
  return (await getInvestigation(env, shop.userId, id))!;
}

/**
 * 回数の上限。どれかが上限を超えていたら false (数えた分は戻さない)。
 * 数は日付 (UTC) ごとに数え、2日たったら消してよい
 */
export async function consumeQuota(env: AppEnv, limits: { key: string; limit: number }[]) {
  const db = getDb(env);
  const day = new Date().toISOString().slice(0, 10);
  const expiresAt = new Date(Date.now() + 2 * 86_400_000);
  await db.delete(usage).where(lt(usage.expiresAt, new Date()));
  let allowed = true;
  for (const { key, limit } of limits) {
    const [row] = await db
      .insert(usage)
      .values({ key: `${key}:${day}`, count: 1, expiresAt })
      .onConflictDoUpdate({ target: usage.key, set: { count: sql`${usage.count} + 1` } })
      .returning({ count: usage.count });
    if (row.count > limit) allowed = false;
  }
  return allowed;
}
