// 手元の確認: 本物の天気 (NOAA) とシミュレーターで、仕込んだ原因が内訳に出るかを見る
// npx tsx scripts/try-demo.ts [調べる数字] [変化の始め,終わり,比べる期間の始め,終わり]
import { investigate } from "../src/lib/analysis/investigate";
import { METRICS, METRIC_BY_KEY } from "../src/lib/sources/catalog";
import { CITY_BY_ID } from "../src/lib/sources/cities";
import { simulate } from "../src/lib/sources/simulator";
import { fetchWeather, type WeatherDay } from "../src/lib/sources/weather";
import { addDays, dateRange } from "../src/lib/util/dates";

const station = CITY_BY_ID.get("portland")!.station;
const recent = await fetchWeather(station, "2026-09-01", "2026-12-31");
const end = recent[recent.length - 1].date;
const start = addDays(end, -400);
const byDate = new Map((await fetchWeather(station, start, end)).map((w) => [w.date, w]));
const dates = dateRange(start, end);
const weather: WeatherDay[] = dates.map((date) => byDate.get(date) ?? { date, tempMax: null, tempMin: null, precipitation: null });
const data: Record<string, (number | null)[]> = simulate(dates, weather, 42, {
  adsPaused: { start: addDays(end, -12), end: addDays(end, -6) },
  viralReel: addDays(end, -26),
});
data.temp_max = weather.map((w) => w.tempMax);
data.temp_min = weather.map((w) => w.tempMin);
data.precipitation = weather.map((w) => w.precipitation);

const target = process.argv[2] ?? "orders";
const [cs, ce, bs, be] = (process.argv[3] ?? `${addDays(end, -11)},${addDays(end, -5)},${addDays(end, -18)},${addDays(end, -12)}`).split(",");
const exclude = new Set([target, "revenue", "average_order_value", "new_customers", "returning_customers", "ad_conversions"]);
const t0 = performance.now();
const result = investigate({
  dates,
  target: { key: target, values: data[target], aggregation: METRIC_BY_KEY.get(target)!.aggregation },
  candidates: METRICS.filter((m) => !exclude.has(m.key)).map((m) => ({ key: m.key, group: m.source, values: data[m.key] })),
  change: { start: cs, end: ce },
  baseline: { start: bs, end: be },
});
console.log(`data until ${end}, ${(performance.now() - t0).toFixed(0)} ms`, {
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
