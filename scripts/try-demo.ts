// 手元の確認: 新しい店と同じデモのデータ (Graph API と同じ形の応答、注文の CSV) を本物と同じ読み込み処理で読み、
// 仕込んだ原因が内訳に出るかを見る
// npx tsx scripts/try-demo.ts [調べる数字] [変化の始め,終わり,比べる期間の始め,終わり] [基準の日]
// 基準の日 (天気が届いている最後の日) を渡すと、その日に作った店と同じデータになる。本番のお試しの店は 2026-10-23
import { investigate } from "../src/lib/analysis/investigate";
import { starterSources } from "../src/lib/shop/setup";
import { CITY_BY_ID } from "../src/lib/sources/cities";
import { SOURCES, sourcedMetrics } from "../src/lib/sources/definitions";
import { collect, PLUGIN_BY_ID, type Connection } from "../src/lib/sources/registry";
import type { Upload } from "../src/lib/sources/types";
import { addDays, dateRange } from "../src/lib/util/dates";

const city = CITY_BY_ID.get("portland")!;
const timezone = city.timezone;
const seed = 20261027;

// 天気が届いている最後の日を基準にする (src/lib/shop/setup.ts と同じ)
const recentDates = dateRange("2026-09-01", addDays(new Date().toISOString().slice(0, 10), -1));
const recent = await collect([{ sourceId: "weather", config: { cityId: city.id } }], recentDates, { timezone, uploads: new Map() });
const end = process.argv[4] ?? recentDates[recent.precipitation.findLastIndex((v, i) => v !== null || recent.temp_max[i] !== null)];
const dataStart = addDays(end, -400);

// 店をつなぐときと同じく、設定とファイルからつなぎ方を作る
const connections: Connection[] = [];
const uploads = new Map<string, Upload>();
for (const source of await starterSources(city.id, timezone, seed, end, dataStart)) {
  const plugin = PLUGIN_BY_ID.get(source.sourceId)!;
  const settings = { ...source.settings };
  if (plugin.ingest && source.file) {
    const ingested = plugin.ingest(source.file, timezone);
    uploads.set(source.sourceId, ingested.upload);
    Object.assign(settings, ingested.settings);
  }
  connections.push({ sourceId: source.sourceId, config: plugin.fromSettings(settings) });
}
const dates = dateRange(dataStart, end);
const data = await collect(connections, dates, { timezone, uploads });
const metrics = sourcedMetrics(SOURCES);

const target = process.argv[2] ?? "orders";
const [cs, ce, bs, be] = (process.argv[3] ?? `${addDays(end, -11)},${addDays(end, -5)},${addDays(end, -18)},${addDays(end, -12)}`).split(",");
const exclude = new Set([target, "revenue", "average_order_value", "new_customers", "returning_customers", "ad_conversions"]);
const t0 = performance.now();
const result = investigate({
  dates,
  target: { key: target, values: data[target], aggregation: metrics.find((m) => m.key === target)!.aggregation },
  candidates: metrics.filter((m) => !exclude.has(m.key)).map((m) => ({ key: m.key, group: m.source, values: data[m.key] })),
  change: { start: cs, end: ce },
  baseline: { start: bs, end: be },
});
console.log(`data until ${end}, ${(performance.now() - t0).toFixed(0)} ms`, {
  base: result.baselineValue,
  now: result.changeValue,
  change: result.change.toFixed(1),
  unexplained: result.unexplained.toFixed(1),
  r2: result.fit.rSquared.toFixed(3),
  selected: result.fit.selected,
});
for (const g of result.groups)
  console.log(
    g.key.padEnd(20),
    g.contribution.toFixed(1).padStart(8),
    "±",
    g.margin.toFixed(1).padStart(6),
    g.columns.map((c) => `${c.column.type === "metric" ? `${c.column.key}@${c.column.lag}` : JSON.stringify(c.column)}:${c.contribution.toFixed(1)}`).join(" "),
  );

// 仕込んだ広告の効果 (シミュレーターの式: 1日前の広告費 × 0.24 + 2日前 × 0.12) を、期間どうしの差で出す
const spend = data.ad_spend as number[];
const driven = (t: number) => 0.24 * spend[t - 1] + 0.12 * spend[t - 2];
const sumOver = (from: string, to: string) => dateRange(from, to).reduce((s, d) => s + driven(dates.indexOf(d)), 0);
console.log("planted ad effect", (sumOver(cs, ce) - sumOver(bs, be)).toFixed(1), "periods", { cs, ce, bs, be });
