import { dateRange } from "../../util/dates";
import type { SimulatedMedia } from "../simulator";
import { dayBounds, type GraphTransport } from "./graph";

/**
 * デモ用の Graph API。シミュレーターの本当の値から、本物と同じ形の応答を返す。
 * データ源は本物と同じ読み込み処理 (graph.ts) でこれを読む
 */

/** Graph API の日時の書き方 (例 2026-10-01T07:00:00+0000) */
const graphTime = (iso: string) => iso.replace(/\.\d{3}Z$/, "+0000");

const PAGE_SIZE = 100;

/** 一覧を Graph API と同じように after のカーソルでページに分ける */
function page<T>(rows: T[], params: Record<string, string>) {
  const start = Number(params.after ?? 0);
  const size = Math.min(Number(params.limit ?? PAGE_SIZE), PAGE_SIZE);
  const data = rows.slice(start, start + size);
  const more = start + size < rows.length;
  return { data, paging: more ? { cursors: { after: String(start + size) }, next: "next" } : {} };
}

/** 広告アカウント (act_{id}) の Insights を返す */
export function demoAdsGraph(input: { accountId: string; dates: string[]; daily: Record<string, number[]> }): GraphTransport {
  const index = new Map(input.dates.map((date, i) => [date, i]));
  return async (path, params) => {
    if (path !== `/act_${input.accountId}/insights`) throw new Error(`デモの Graph API にない経路です: ${path}`);
    const range = JSON.parse(params.time_range) as { since: string; until: string };
    const rows = dateRange(range.since, range.until)
      .filter((date) => index.has(date) && input.daily.ad_spend[index.get(date)!] > 0)
      .map((date) => {
        const i = index.get(date)!;
        const d = input.daily;
        return {
          date_start: date,
          date_stop: date,
          spend: d.ad_spend[i].toFixed(2),
          impressions: String(d.ad_impressions[i]),
          reach: String(d.ad_reach[i]),
          clicks: String(d.ad_clicks[i]),
          ctr: d.ad_ctr[i].toFixed(6),
          cpc: d.ad_cpc[i].toFixed(6),
          cpm: d.ad_cpm[i].toFixed(6),
          actions: [
            { action_type: "link_click", value: String(d.ad_clicks[i]) },
            { action_type: "purchase", value: String(d.ad_conversions[i]) },
          ],
        };
      });
    return page(rows, params);
  };
}

/** Instagram のアカウント ({ig-user-id}) の insights と投稿の一覧を返す */
export function demoInstagramGraph(input: {
  igUserId: string;
  dates: string[];
  timezone: string;
  daily: Record<string, number[]>;
  media: SimulatedMedia[];
}): GraphTransport {
  const index = new Map(input.dates.map((date, i) => [date, i]));
  // 日付ごとの、店のタイムゾーンでの始まりと終わり (Unix 秒)。問い合わせのたびに計算し直さないよう先に作る
  const bounds = input.dates.map((date) => ({ date, ...dayBounds(date, input.timezone) }));
  const datesBetween = (since: number, until: number) => bounds.filter((b) => b.since >= since && b.until <= until).map((b) => b.date);
  const endOf = new Map(bounds.map((b) => [b.date, b.until]));

  return async (path, params) => {
    if (path === `/${input.igUserId}/media`) {
      const since = Number(params.since) * 1000;
      const until = Number(params.until) * 1000;
      const rows = input.media
        .filter((item) => Date.parse(item.timestamp) >= since && Date.parse(item.timestamp) < until)
        .map((item) => ({ ...item, timestamp: graphTime(item.timestamp) }));
      return page(rows, params);
    }
    if (path !== `/${input.igUserId}/insights`) throw new Error(`デモの Graph API にない経路です: ${path}`);
    const days = datesBetween(Number(params.since), Number(params.until));
    const metrics = params.metric.split(",");
    if (params.metric_type === "time_series") {
      return {
        data: metrics.map((name) => ({
          name,
          period: "day",
          values: days.map((date) => ({
            value: input.daily[name][index.get(date)!],
            // その日の終わり (次の日の 0:00) を指す
            end_time: graphTime(new Date(endOf.get(date)! * 1000).toISOString()),
          })),
        })),
      };
    }
    return {
      data: metrics.map((name) => ({
        name,
        period: "day",
        total_value: { value: days.reduce((sum, date) => sum + input.daily[name][index.get(date)!], 0) },
      })),
    };
  };
}

