import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { series, shop, shopSource } from "../db/schema";
import { SOURCE_BY_ID } from "../sources/definitions";
import { collect, type Connection } from "../sources/registry";
import type { DailyValues, SourceDefinition } from "../sources/types";
import { addDays, dateRange, todayIn } from "../util/dates";

/** データをそろえ直す間隔。NOAA の観測は1日1回ほど増える */
const SYNC_INTERVAL_MS = 60 * 60 * 1000;

export type ShopRecord = typeof shop.$inferSelect;

export async function getShop(env: AppEnv, userId: string) {
  const [row] = await getDb(env).select().from(shop).where(eq(shop.userId, userId)).limit(1);
  return row ?? null;
}

/** 店がつないだデータ源と、その設定 */
export async function listConnections(env: AppEnv, userId: string): Promise<Connection[]> {
  const rows = await getDb(env).select().from(shopSource).where(eq(shopSource.userId, userId));
  return rows.map((row) => ({ sourceId: row.sourceId, config: JSON.parse(row.config) as unknown }));
}

/** 店を作り、データ源をつなぐ */
export async function createShop(
  env: AppEnv,
  input: { userId: string; name: string; city: string; timezone: string; dataStart: string },
  connections: Connection[],
) {
  const db = getDb(env);
  await db.batch([
    db.insert(shop).values(input),
    ...connections.map((connection) =>
      db.insert(shopSource).values({ userId: input.userId, sourceId: connection.sourceId, config: JSON.stringify(connection.config) }),
    ),
  ]);
  const created = await getShop(env, input.userId);
  if (!created) throw new Error("店を作れませんでした");
  await syncShopData(env, created);
  return created;
}

/** そのデータ源が、その日の値をまだ1つも返していない */
function missingDay(source: SourceDefinition, values: DailyValues, index: number) {
  return source.metrics.every((metric) => values[metric.key][index] === null);
}

/**
 * dataStart から昨日までの値を、つないだデータ源から集めてそろえる。
 * どのデータ源もそろっている最後の日までを残し (天気は数日遅れで届く)、届くまで遅れのある数字は直近のその日数を null にする
 */
export async function syncShopData(env: AppEnv, record: ShopRecord) {
  if (record.syncedAt && Date.now() - record.syncedAt.getTime() < SYNC_INTERVAL_MS) return;

  const connections = await listConnections(env, record.userId);
  const requested = dateRange(record.dataStart, addDays(todayIn(record.timezone), -1));
  const values = await collect(connections, requested);
  const sources = connections.map((connection) => SOURCE_BY_ID.get(connection.sourceId)!);

  let length = requested.length;
  while (length > 0 && sources.some((source) => missingDay(source, values, length - 1))) length--;
  if (length === 0) throw new Error("どのデータ源にも、そろった日がありません");

  const db = getDb(env);
  const statements = sources.flatMap((source) =>
    source.metrics.map((metric) => {
      const list = values[metric.key].slice(0, length);
      const delayed = JSON.stringify(list.map((v, i) => (i >= length - metric.latencyDays ? null : v)));
      return db
        .insert(series)
        .values({ userId: record.userId, metric: metric.key, sourceId: source.id, startDate: record.dataStart, values: delayed })
        .onConflictDoUpdate({
          target: [series.userId, series.metric],
          set: { sourceId: source.id, startDate: record.dataStart, values: delayed, updatedAt: new Date() },
        });
    }),
  );
  const markSynced = db.update(shop).set({ syncedAt: new Date() }).where(eq(shop.userId, record.userId));
  await db.batch([markSynced, ...statements]);
}

export type LoadedSeries = {
  dates: string[];
  values: Map<string, (number | null)[]>;
  /** つないだデータ源 (数字の説明つき) */
  sources: SourceDefinition[];
};

export async function loadSeries(env: AppEnv, record: ShopRecord): Promise<LoadedSeries> {
  const [rows, connections] = await Promise.all([
    getDb(env).select().from(series).where(eq(series.userId, record.userId)),
    listConnections(env, record.userId),
  ]);
  const values = new Map(rows.map((row) => [row.metric, JSON.parse(row.values) as (number | null)[]]));
  const length = values.values().next().value?.length ?? 0;
  return {
    dates: dateRange(record.dataStart, addDays(record.dataStart, length - 1)),
    values,
    sources: connections.map((connection) => SOURCE_BY_ID.get(connection.sourceId)!),
  };
}
