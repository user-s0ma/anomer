// 手元の確認: 本物の天気とシミュレーターで、仕込んだ原因が内訳に出るかを見る
import { investigate } from "../src/lib/analysis/investigate";
import { METRICS, METRIC_BY_KEY } from "../src/lib/sources/catalog";
import { simulate } from "../src/lib/sources/simulator";
import { fetchWeather } from "../src/lib/sources/weather";

const day = (base: string, offset: number) => new Date(Date.parse(`${base}T00:00:00Z`) + offset * 86_400_000).toISOString().slice(0, 10);

const end = "2026-10-26";
const start = day(end, -399);
const dates = Array.from({ length: 400 }, (_, i) => day(start, i));
const weather = await fetchWeather({ latitude: 45.52, longitude: -122.68, timezone: "America/Los_Angeles" }, start, end);
const data = simulate(dates, weather, 42, { adsPaused: { start: day(end, -12), end: day(end, -6) }, viralReel: day(end, -26) });
data.temp_max = weather.map((w) => w.tempMax!);
data.temp_min = weather.map((w) => w.tempMin!);
data.precipitation = weather.map((w) => w.precipitation!);
data.sunshine = weather.map((w) => w.sunshine!);

const target = process.argv[2] ?? "orders";
const [cs, ce, bs, be] = (process.argv[3] ?? `${day(end, -11)},${day(end, -5)},${day(end, -18)},${day(end, -12)}`).split(",");
const exclude = new Set([target, "revenue", "average_order_value", "new_customers", "returning_customers", "ad_conversions"]);
const t0 = performance.now();
const result = investigate({
  dates,
  target: { key: target, values: data[target], aggregation: METRIC_BY_KEY.get(target)!.aggregation },
  candidates: METRICS.filter((m) => !exclude.has(m.key)).map((m) => ({ key: m.key, group: m.source, values: data[m.key] })),
  change: { start: cs, end: ce },
  baseline: { start: bs, end: be },
});
console.log(`${(performance.now() - t0).toFixed(0)} ms`, { change: result.change.toFixed(1), base: result.baselineValue, now: result.changeValue, unexplained: result.unexplained.toFixed(1), fit: result.fit });
for (const g of result.groups) console.log(g.key.padEnd(28), g.contribution.toFixed(1).padStart(8), "±", g.margin.toFixed(1).padStart(6), g.columns.map((c) => `${c.column.type === "metric" ? c.column.key + "@" + c.column.lag : JSON.stringify(c.column)}:${c.contribution.toFixed(1)}`).join(" "));
