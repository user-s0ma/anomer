import { z } from "zod";
import { daysBetween } from "../../util/dates";
import { ORDERS } from "../definitions";
import { aggregateOrderCsv } from "../orders-csv";
import type { DataSourcePlugin } from "../types";

const ordersConfig = z.object({
  /** 上げた CSV のファイル名 */
  filename: z.string().min(1),
  /** デモのデータとして作った CSV か */
  demo: z.boolean(),
  rows: z.number().int().min(1),
});

/**
 * 注文の CSV。上げたときに日別にまとめて保存してあり (orders-csv.ts)、ここではそれを日付に合わせて返す。
 * CSV にない日 (最初の注文より前、最後の注文より後) は null
 */
export const orders: DataSourcePlugin<z.infer<typeof ordersConfig>> = {
  definition: ORDERS,
  config: ordersConfig,
  fromSettings: (settings) => ordersConfig.parse(settings),
  isDemo: (config) => config.demo,
  ingest(file, timezone) {
    const daily = aggregateOrderCsv(file.text, timezone);
    return {
      upload: { firstDate: daily.firstDate, values: daily.values },
      settings: { filename: file.name, demo: file.demo, rows: daily.rows },
    };
  },
  async fetch({ dates, upload }) {
    if (!upload) throw new Error("注文の CSV がまだ上がっていません");
    const length = upload.values.orders.length;
    // dates の最初の日が、CSV の最初の日から何日目か
    const offset = daysBetween(upload.firstDate, dates[0]);
    return Object.fromEntries(
      ORDERS.metrics.map((metric) => [
        metric.key,
        dates.map((_, i) => {
          const j = offset + i;
          return j >= 0 && j < length ? upload.values[metric.key][j] : null;
        }),
      ]),
    );
  },
};
