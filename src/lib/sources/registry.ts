import { instagramSimulator, metaAdsSimulator, ordersSimulator } from "./plugins/simulated";
import { weatherPlugin } from "./plugins/weather";
import type { DailyValues, DataSourcePlugin } from "./types";

/** いま使えるデータ源 (プラグイン)。新しいデータ源は、ここに足す */
const PLUGINS: DataSourcePlugin<never>[] = [weatherPlugin, metaAdsSimulator, instagramSimulator, ordersSimulator] as DataSourcePlugin<never>[];

export const PLUGIN_BY_ID = new Map(PLUGINS.map((plugin) => [plugin.definition.id, plugin]));

export type Connection = { sourceId: string; config: unknown };

/**
 * 店がつないだデータ源から、dates の日別の値を集める。ほかのデータ源の値を使うものは、それを先に取る。
 * 返すのは数字の名前ごとの値 (届くまでの遅れは、まだ当てていない)
 */
export async function collect(connections: Connection[], dates: string[]): Promise<DailyValues> {
  const byId = new Map(connections.map((connection) => [connection.sourceId, connection]));
  const values: DailyValues = {};
  const done = new Set<string>();
  const visiting = new Set<string>();

  const run = async (id: string) => {
    if (done.has(id)) return;
    if (visiting.has(id)) throw new Error(`データ源の依存が循環しています: ${id}`);
    const plugin = PLUGIN_BY_ID.get(id);
    const connection = byId.get(id);
    if (!plugin) throw new Error(`知らないデータ源です: ${id}`);
    if (!connection) throw new Error(`${id} を使うデータ源がありますが、つながっていません`);
    visiting.add(id);
    for (const dependency of plugin.definition.dependsOn) await run(dependency);
    const config = plugin.config.parse(connection.config);
    const result = await plugin.fetch({ config: config as never, dates, inputs: values });
    for (const metric of plugin.definition.metrics) {
      const list = result[metric.key];
      if (!list || list.length !== dates.length) throw new Error(`${id} が ${metric.key} を ${dates.length} 日分返しませんでした`);
      values[metric.key] = list;
    }
    visiting.delete(id);
    done.add(id);
  };

  for (const connection of connections) await run(connection.sourceId);
  return values;
}
