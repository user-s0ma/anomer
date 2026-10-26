import assert from "node:assert/strict";
import { test } from "node:test";
import { investigate, type MetricSeries } from "../src/lib/analysis/investigate";

/** 再現できる乱数 (mulberry32) */
function random(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rand: () => number) {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}

function makeDates(first: string, count: number) {
  const start = Date.parse(`${first}T00:00:00Z`);
  return Array.from({ length: count }, (_, i) => new Date(start + i * 86_400_000).toISOString().slice(0, 10));
}

test("仕込んだ原因 (広告の停止、雨、25日) を内訳で当てる", () => {
  const rand = random(7);
  const dates = makeDates("2025-10-01", 400);
  const n = dates.length;
  // 変化の期間: 最後の7日。比べる期間: その前の7日
  const changeStart = n - 7;

  const ads = dates.map((_, t) => (t >= changeStart ? 0 : 40 + 4 * normal(rand)));
  const rain = dates.map(() => (rand() < 0.25 ? 5 + 10 * rand() : 0));
  const unrelated = dates.map(() => 50 + 10 * normal(rand));

  const orders = dates.map((date, t) => {
    const weekend = [5, 6].includes((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7) ? 30 : 0;
    const payday = date.endsWith("-25") ? 40 : 0;
    const adEffect = t >= 1 ? 1.5 * ads[t - 1] : 1.5 * 40;
    return 150 + weekend + payday + adEffect - 2 * rain[t] + 3 * normal(rand);
  });

  const series = (key: string, values: number[]): MetricSeries => ({ key, group: key, values });
  // 比べる期間 (10/22〜28) は 25日を含み、変化の期間 (10/29〜11/4) は含まない
  const result = investigate({
    dates,
    target: { key: "orders", values: orders, aggregation: "sum" },
    candidates: [series("ad_spend", ads), series("rain", rain), series("unrelated", unrelated)],
    change: { start: dates[changeStart], end: dates[n - 1] },
    baseline: { start: dates[changeStart - 7], end: dates[changeStart - 1] },
  });

  const byKey = new Map(result.groups.map((g) => [g.key, g]));
  const sum = (values: number[]) => values.reduce((s, v) => s + v, 0);
  // 広告は1日遅れで効く。仕込んだ寄与 = 1.5 × (前日の広告費の、期間どうしの合計の差)
  const adGroup = byKey.get("source:ad_spend");
  assert.ok(adGroup, "広告費が残る");
  const plantedAds = 1.5 * (sum(ads.slice(changeStart - 1, n - 1)) - sum(ads.slice(changeStart - 8, changeStart - 1)));
  assert.ok(Math.abs(adGroup.contribution - plantedAds) <= adGroup.margin, `広告の寄与 ${adGroup.contribution} ± ${adGroup.margin}、仕込んだ値 ${plantedAds}`);

  const payday = byKey.get("dayOfMonth");
  assert.ok(payday, "月の中の日 (25日) が残る");
  assert.ok(Math.abs(payday.contribution - -40) <= payday.margin, `25日の寄与 ${payday.contribution} ± ${payday.margin}`);

  const unrelatedGroup = byKey.get("source:unrelated");
  assert.ok(!unrelatedGroup || Math.abs(unrelatedGroup.contribution) < 30, "関係のない数字はほとんど効かない");

  // 内訳の合計 + 説明できない分 = 実際の変化
  const total = result.groups.reduce((s, g) => s + g.contribution, 0) + result.unexplained;
  assert.ok(Math.abs(total - result.change) < 1e-6);
  assert.ok(result.fit.rSquared > 0.9, `R2 = ${result.fit.rSquared}`);
});
