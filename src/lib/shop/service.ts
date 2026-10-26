import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { series, shop } from "../db/schema";
import { METRICS } from "../sources/catalog";
import { CITY_BY_ID } from "../sources/cities";
import { simulate, type SimulationEvents } from "../sources/simulator";
import { fetchWeather, type WeatherDay } from "../sources/weather";
import { addDays, dateRange, todayIn } from "../util/dates";

/** データを持つ日数 (Lasso の当てはめに約1年分、月の中の日が12回ずつ見られるように) */
const HISTORY_DAYS = 400;
/** データをそろえ直す間隔。NOAA の観測は1日1回ほど増える */
const SYNC_INTERVAL_MS = 60 * 60 * 1000;

/** お試しの店 (架空)。天気は本物の Portland のもの */
export const DEMO_SHOP = { name: "Juniper & Rye Bakery", cityId: "portland", seed: 20261027 };

export type ShopRecord = typeof shop.$inferSelect;

export function cityOf(record: Pick<ShopRecord, "cityId">) {
  const city = CITY_BY_ID.get(record.cityId);
  if (!city) throw new Error(`知らない都市です: ${record.cityId}`);
  return city;
}

/**
 * 仕込む原因の日付。データの最後の日を基準に、広告を止めた週は1〜2週間前、リールが伸びた日は約4週間前に置く
 * (「先週」「先月」と聞いたときに見つかる位置)
 */
function plantEvents(anchor: string): SimulationEvents {
  return {
    adsPaused: { start: addDays(anchor, -12), end: addDays(anchor, -6) },
    viralReel: addDays(anchor, -26),
  };
}

export async function getShop(env: AppEnv, userId: string) {
  const [row] = await getDb(env).select().from(shop).where(eq(shop.userId, userId)).limit(1);
  return row ?? null;
}

/** 観測所の、昨日までに届いている天気 */
async function weatherUntilYesterday(cityId: string, start: string) {
  const city = cityOf({ cityId });
  const days = await fetchWeather(city.station, start, addDays(todayIn(city.timezone), -1));
  if (days.length === 0) throw new Error(`${city.station} の天気が取れませんでした`);
  return days;
}

export async function createShop(env: AppEnv, userId: string, input: { name: string; cityId: string }, seed: number) {
  // 天気が届いている最後の日を基準にする (仕込む原因もそこから数える)
  const city = cityOf(input);
  const probe = await fetchWeather(city.station, addDays(todayIn(city.timezone), -30), addDays(todayIn(city.timezone), -1));
  const anchor = probe[probe.length - 1]?.date;
  if (!anchor) throw new Error(`${city.station} の直近の天気が取れませんでした`);
  await getDb(env)
    .insert(shop)
    .values({
      userId,
      ...input,
      simulationSeed: seed,
      simulationEvents: JSON.stringify(plantEvents(anchor)),
      dataStart: addDays(anchor, -HISTORY_DAYS),
    })
    .onConflictDoNothing();
  const created = await getShop(env, userId);
  if (!created) throw new Error("店を作れませんでした");
  await syncShopData(env, created);
  return created;
}

/**
 * dataStart から、天気が届いている最後の日までの数字をそろえる。
 * 天気は本物 (NOAA) を取り、それをもとにシミュレーターで残りを作る。届くまで遅れのある数字は、直近のその日数を null にする
 */
export async function syncShopData(env: AppEnv, record: ShopRecord) {
  if (record.syncedAt && Date.now() - record.syncedAt.getTime() < SYNC_INTERVAL_MS) return;

  const weather = await weatherUntilYesterday(record.cityId, record.dataStart);
  const end = weather[weather.length - 1].date;
  const dates = dateRange(record.dataStart, end);
  const byDate = new Map(weather.map((w) => [w.date, w]));
  // 観測が欠けた日は、値を null にした日として並べる
  const aligned: WeatherDay[] = dates.map((date) => byDate.get(date) ?? { date, tempMax: null, tempMin: null, precipitation: null });

  const simulated = simulate(dates, aligned, record.simulationSeed, JSON.parse(record.simulationEvents) as SimulationEvents);
  const values: Record<string, (number | null)[]> = {
    ...simulated,
    temp_max: aligned.map((w) => w.tempMax),
    temp_min: aligned.map((w) => w.tempMin),
    precipitation: aligned.map((w) => w.precipitation),
  };

  const db = getDb(env);
  const statements = METRICS.map((metric) => {
    const list = values[metric.key];
    if (!list) throw new Error(`データ源が ${metric.key} を返しませんでした`);
    const delayed = JSON.stringify(list.map((v, i) => (i >= list.length - metric.latencyDays ? null : v)));
    return db
      .insert(series)
      .values({ userId: record.userId, metric: metric.key, startDate: record.dataStart, values: delayed })
      .onConflictDoUpdate({ target: [series.userId, series.metric], set: { startDate: record.dataStart, values: delayed, updatedAt: new Date() } });
  });
  const markSynced = db.update(shop).set({ syncedAt: new Date() }).where(eq(shop.userId, record.userId));
  await db.batch([markSynced, ...statements]);
}

export type LoadedSeries = { dates: string[]; values: Map<string, (number | null)[]> };

export async function loadSeries(env: AppEnv, record: ShopRecord): Promise<LoadedSeries> {
  const rows = await getDb(env).select().from(series).where(eq(series.userId, record.userId));
  const values = new Map(rows.map((row) => [row.metric, JSON.parse(row.values) as (number | null)[]]));
  const length = values.values().next().value?.length ?? 0;
  return { dates: dateRange(record.dataStart, addDays(record.dataStart, length - 1)), values };
}
