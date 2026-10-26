import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import { series, shop, shopSource, sourceUpload } from "../db/schema";
import { SOURCE_BY_ID } from "../sources/definitions";
import { collect, PLUGIN_BY_ID, type Connection } from "../sources/registry";
import type { DailyValues, SourceDefinition, Upload } from "../sources/types";
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

/** ファイルを上げたデータ源の、日別にまとめた値 */
async function listUploads(env: AppEnv, userId: string) {
  const rows = await getDb(env).select().from(sourceUpload).where(eq(sourceUpload.userId, userId));
  return new Map(rows.map((row) => [row.sourceId, JSON.parse(row.upload) as Upload]));
}

/** つないだデータ源が、デモのデータを読んでいるか */
export function isDemoConnection(connection: Connection) {
  const plugin = PLUGIN_BY_ID.get(connection.sourceId)!;
  return plugin.isDemo(plugin.config.parse(connection.config) as never);
}

/** 店の人に見せる失敗 (つなげない理由、CSV の誤りなど) */
export class SourceError extends Error {}

export type SourceInput = {
  sourceId: string;
  /** 画面で入れてもらった設定。seed の項目がなければ乱数で決める */
  settings: Record<string, unknown>;
  /** ファイルを上げるデータ源のファイル */
  file?: { name: string; text: string; demo: boolean };
};

/**
 * データ源を1つつなぐ。値を作るのに要るデータ源が先につながっていないとつなげない。
 * ファイルを上げるデータ源は、ここでファイルを読んで日別にまとめて保存する。つないだら、次に値をそろえ直す
 */
export async function connectSource(env: AppEnv, record: ShopRecord, input: SourceInput) {
  const plugin = PLUGIN_BY_ID.get(input.sourceId);
  if (!plugin) throw new SourceError("Unknown data source.");
  const connected = new Set((await listConnections(env, record.userId)).map((c) => c.sourceId));
  if (connected.has(input.sourceId)) throw new SourceError("This data source is already connected.");
  const missing = plugin.definition.dependsOn.filter((id) => !connected.has(id));
  if (missing.length > 0) throw new SourceError(`Connect ${missing.map((id) => SOURCE_BY_ID.get(id)!.label.en).join(", ")} first.`);

  const settings: Record<string, unknown> = { ...input.settings };
  for (const field of plugin.definition.settings) {
    if (field.type === "seed" && settings[field.key] === undefined) settings[field.key] = crypto.getRandomValues(new Uint32Array(1))[0] >>> 1;
  }
  let upload: Upload | null = null;
  if (plugin.ingest) {
    if (!input.file) throw new SourceError("Choose a file to upload.");
    try {
      const ingested = plugin.ingest(input.file, record.timezone);
      upload = ingested.upload;
      Object.assign(settings, ingested.settings);
    } catch (error) {
      throw new SourceError(error instanceof Error ? error.message : "Could not read the file.");
    }
  }
  let config: unknown;
  try {
    config = plugin.fromSettings(settings);
  } catch (error) {
    if (error instanceof z.ZodError) throw new SourceError("Please check the settings.");
    throw error;
  }

  const db = getDb(env);
  const statements = [
    db.insert(shopSource).values({ userId: record.userId, sourceId: input.sourceId, config: JSON.stringify(config) }),
    db.update(shop).set({ syncedAt: null }).where(eq(shop.userId, record.userId)),
  ];
  const [first, ...rest] = statements;
  await db.batch(
    upload
      ? [first, ...rest, db.insert(sourceUpload).values({ userId: record.userId, sourceId: input.sourceId, upload: JSON.stringify(upload) })]
      : [first, ...rest],
  );
}

/** データ源を外す。ほかのつないだデータ源が値を使っているものは外せない。外したデータ源の値も消す */
export async function disconnectSource(env: AppEnv, userId: string, sourceId: string) {
  const connections = await listConnections(env, userId);
  if (!connections.some((c) => c.sourceId === sourceId)) throw new SourceError("This data source is not connected.");
  const users = connections.filter((c) => SOURCE_BY_ID.get(c.sourceId)?.dependsOn.includes(sourceId));
  if (users.length > 0) {
    throw new SourceError(`${users.map((c) => SOURCE_BY_ID.get(c.sourceId)!.label.en).join(", ")} uses this data source. Remove it first.`);
  }
  if (connections.length === 1) throw new SourceError("Keep at least one data source.");
  const db = getDb(env);
  const where = <T extends typeof shopSource | typeof series | typeof sourceUpload>(table: T) =>
    and(eq(table.userId, userId), eq(table.sourceId, sourceId));
  await db.batch([
    db.delete(shopSource).where(where(shopSource)),
    db.delete(sourceUpload).where(where(sourceUpload)),
    db.delete(series).where(where(series)),
    db.update(shop).set({ syncedAt: null }).where(eq(shop.userId, userId)),
  ]);
}

/** 店を作り、データ源をつなぐ */
export async function createShop(
  env: AppEnv,
  input: { userId: string; name: string; city: string; timezone: string; dataStart: string },
  sources: SourceInput[],
) {
  await getDb(env).insert(shop).values(input);
  const created = await getShop(env, input.userId);
  if (!created) throw new Error("店を作れませんでした");
  for (const source of sources) await connectSource(env, created, source);
  await syncShopData(env, (await getShop(env, input.userId))!);
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

  const [connections, uploads] = await Promise.all([listConnections(env, record.userId), listUploads(env, record.userId)]);
  const requested = dateRange(record.dataStart, addDays(todayIn(record.timezone), -1));
  const values = await collect(connections, requested, { timezone: record.timezone, uploads });
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
