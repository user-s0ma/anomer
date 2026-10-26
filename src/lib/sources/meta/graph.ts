/**
 * Meta の Graph API (v26.0) から、広告と Instagram の日別の数字を読む。
 * 呼び出し方 (transport) を差し替えられるようにしてあり、本物はアクセストークンで graph.facebook.com を呼び、
 * デモはシミュレーターが同じ形の応答を返す (meta/demo.ts)。読み方はどちらも同じ
 */

import { dateIn } from "../../util/dates";

export const GRAPH_VERSION = "v26.0";
const GRAPH_ORIGIN = "https://graph.facebook.com";

/** パス (例 /act_123/insights) と問い合わせの値を受け取り、応答の JSON を返す */
export type GraphTransport = (path: string, params: Record<string, string>) => Promise<unknown>;

/** 本物の Graph API を、アクセストークンで呼ぶ */
export function graphApi(accessToken: string): GraphTransport {
  return async (path, params) => {
    const url = new URL(`${GRAPH_ORIGIN}/${GRAPH_VERSION}${path}`);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    url.searchParams.set("access_token", accessToken);
    const response = await fetch(url);
    const body = (await response.json()) as { error?: { message?: string } };
    if (!response.ok || body.error) throw new Error(`Graph API ${path}: ${body.error?.message ?? response.status}`);
    return body;
  };
}

type Paging = { paging?: { cursors?: { after?: string }; next?: string } };

/** 続きのページがあれば after のカーソルで読み進める */
async function readAllPages<T>(transport: GraphTransport, path: string, params: Record<string, string>) {
  const rows: T[] = [];
  let after: string | undefined;
  for (;;) {
    const page = (await transport(path, after ? { ...params, after } : params)) as { data: T[] } & Paging;
    rows.push(...page.data);
    if (!page.paging?.next || !page.paging.cursors?.after) return rows;
    after = page.paging.cursors.after;
  }
}

const toNumber = (value: string | undefined) => (value === undefined ? null : Number(value));

// ---------------------------------------------------------------- 広告 (Marketing API の Insights)

type AdsActionStat = { action_type: string; value: string };

type AdInsightsRow = {
  date_start: string;
  date_stop: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  cpm?: string;
  actions?: AdsActionStat[];
};

export type AdDay = {
  date: string;
  spend: number | null;
  impressions: number | null;
  reach: number | null;
  clicks: number | null;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  /** 広告のおかげとみなされた購入 (actions の purchase) */
  purchases: number | null;
};

export const AD_INSIGHTS_FIELDS = ["spend", "impressions", "reach", "clicks", "ctr", "cpc", "cpm", "actions"];

/**
 * 広告アカウントの日別の数字。since〜until (どちらも含む、YYYY-MM-DD)。
 * 広告を出していない日は行が返らないので、呼び出し側で0として扱う
 */
export async function fetchAdInsightsDaily(transport: GraphTransport, accountId: string, since: string, until: string): Promise<AdDay[]> {
  const rows = await readAllPages<AdInsightsRow>(transport, `/act_${accountId}/insights`, {
    level: "account",
    time_increment: "1",
    time_range: JSON.stringify({ since, until }),
    fields: AD_INSIGHTS_FIELDS.join(","),
    limit: "500",
  });
  return rows.map((row) => ({
    date: row.date_start,
    spend: toNumber(row.spend),
    impressions: toNumber(row.impressions),
    reach: toNumber(row.reach),
    clicks: toNumber(row.clicks),
    ctr: toNumber(row.ctr),
    cpc: toNumber(row.cpc),
    cpm: toNumber(row.cpm),
    purchases: Number(row.actions?.find((action) => action.action_type === "purchase")?.value ?? 0),
  }));
}

// ---------------------------------------------------------------- Instagram (Instagram Graph API)

type InsightValue = {
  name: string;
  period: string;
  /** metric_type=time_series のとき */
  values?: { value: number; end_time: string }[];
  /** metric_type=total_value のとき */
  total_value?: { value: number };
};

/** 日ごとの合計しか返らない指標 (v26.0 では reach だけが日別の時系列で取れる) */
export const INSTAGRAM_DAILY_TOTAL_METRICS = ["views", "likes", "comments", "saves", "shares", "profile_links_taps"] as const;

export type InstagramDay = {
  date: string;
  reach: number | null;
  posts: number;
  reels: number;
} & Record<(typeof INSTAGRAM_DAILY_TOTAL_METRICS)[number], number | null>;

type MediaItem = { id: string; timestamp: string; media_product_type: string };

/** その日 (タイムゾーンでの 0:00〜24:00) の Unix 秒 */
export function dayBounds(date: string, timezone: string) {
  // その日のタイムゾーンでの 0:00 を、UTC との時差から求める
  const noon = new Date(`${date}T12:00:00Z`);
  const local = new Date(noon.toLocaleString("en-US", { timeZone: timezone }));
  const offsetMs = local.getTime() - noon.getTime();
  const start = Date.parse(`${date}T00:00:00Z`) - offsetMs;
  return { since: Math.floor(start / 1000), until: Math.floor(start / 1000) + 86_400 };
}

export function localDate(timestamp: string, timezone: string) {
  return dateIn(timezone, new Date(timestamp));
}

/**
 * Instagram のアカウントの日別の数字。reach は時系列で、ほかは1日ずつの合計で読み、
 * 投稿とリールの数は投稿の一覧の timestamp から数える
 */
export async function fetchInstagramDaily(
  transport: GraphTransport,
  igUserId: string,
  dates: string[],
  timezone: string,
): Promise<InstagramDay[]> {
  const first = dayBounds(dates[0], timezone);
  const last = dayBounds(dates[dates.length - 1], timezone);

  const reachByDate = new Map<string, number>();
  // 時系列の問い合わせは30日ずつに分ける
  for (let i = 0; i < dates.length; i += 30) {
    const chunk = dates.slice(i, i + 30);
    const body = (await transport(`/${igUserId}/insights`, {
      metric: "reach",
      period: "day",
      metric_type: "time_series",
      since: String(dayBounds(chunk[0], timezone).since),
      until: String(dayBounds(chunk[chunk.length - 1], timezone).until),
    })) as { data: InsightValue[] };
    for (const point of body.data.find((d) => d.name === "reach")?.values ?? []) {
      // end_time はその日の終わり (次の日の 0:00) を指すので、1秒戻して日付にする
      reachByDate.set(localDate(new Date(Date.parse(point.end_time) - 1000).toISOString(), timezone), point.value);
    }
  }

  const totals = new Map<string, Record<string, number>>();
  for (const date of dates) {
    const bounds = dayBounds(date, timezone);
    const body = (await transport(`/${igUserId}/insights`, {
      metric: INSTAGRAM_DAILY_TOTAL_METRICS.join(","),
      period: "day",
      metric_type: "total_value",
      since: String(bounds.since),
      until: String(bounds.until),
    })) as { data: InsightValue[] };
    totals.set(date, Object.fromEntries(body.data.map((d) => [d.name, d.total_value?.value ?? 0])));
  }

  const media = await readAllPages<MediaItem>(transport, `/${igUserId}/media`, {
    fields: "id,timestamp,media_product_type",
    since: String(first.since),
    until: String(last.until),
    limit: "100",
  });
  const posts = new Map<string, { posts: number; reels: number }>();
  for (const item of media) {
    const date = localDate(item.timestamp, timezone);
    const count = posts.get(date) ?? { posts: 0, reels: 0 };
    if (item.media_product_type === "REELS") count.reels++;
    else if (item.media_product_type === "FEED") count.posts++;
    posts.set(date, count);
  }

  return dates.map((date) => {
    const total = totals.get(date);
    return {
      date,
      reach: reachByDate.get(date) ?? null,
      posts: posts.get(date)?.posts ?? 0,
      reels: posts.get(date)?.reels ?? 0,
      ...(Object.fromEntries(INSTAGRAM_DAILY_TOTAL_METRICS.map((name) => [name, total ? (total[name] ?? null) : null])) as Record<
        (typeof INSTAGRAM_DAILY_TOTAL_METRICS)[number],
        number | null
      >),
    };
  });
}
