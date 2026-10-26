import { z } from "zod";
import { INSTAGRAM, META_ADS } from "../definitions";
import { demoAdsGraph, demoInstagramGraph } from "../meta/demo";
import { fetchAdInsightsDaily, fetchInstagramDaily, graphApi, INSTAGRAM_DAILY_TOTAL_METRICS } from "../meta/graph";
import { simulateAds, simulateInstagram } from "../simulator";
import type { DataSourcePlugin } from "../types";

/*
 * Meta の広告と Instagram。どちらも Graph API の応答を読む。
 * 本物はアクセストークンで graph.facebook.com を呼ぶ (トークンを入れる画面はまだない)。
 * デモはシミュレーターが同じ形の応答を返し、同じ読み込み処理で読む
 */

const date = z.iso.date();
const seed = z.number().int();

/** デモの広告アカウントの id (Graph API の act_{id}) */
const DEMO_AD_ACCOUNT = "1000000000000001";
/** デモの Instagram のアカウントの id */
const DEMO_IG_USER = "17841400000000001";

const adsConfig = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("demo"), seed, pausedFrom: date, pausedTo: date }),
  z.object({ mode: z.literal("graph"), accountId: z.string().min(1), accessToken: z.string().min(1) }),
]);

export const metaAds: DataSourcePlugin<z.infer<typeof adsConfig>> = {
  definition: META_ADS,
  config: adsConfig,
  fromSettings: (settings) => adsConfig.parse({ mode: "demo", ...settings }),
  isDemo: (config) => config.mode === "demo",
  async fetch({ config, dates }) {
    const accountId = config.mode === "demo" ? DEMO_AD_ACCOUNT : config.accountId;
    const transport =
      config.mode === "demo"
        ? demoAdsGraph({ accountId, dates, daily: simulateAds(dates, config.seed, { start: config.pausedFrom, end: config.pausedTo }) })
        : graphApi(config.accessToken);
    const rows = await fetchAdInsightsDaily(transport, accountId, dates[0], dates[dates.length - 1]);
    const byDate = new Map(rows.map((row) => [row.date, row]));
    // 広告を出していない日は行が返らないので、0 にする
    const pick = (key: keyof Omit<(typeof rows)[number], "date">) => dates.map((d) => (byDate.has(d) ? byDate.get(d)![key] : 0));
    return {
      ad_spend: pick("spend"),
      ad_impressions: pick("impressions"),
      ad_reach: pick("reach"),
      ad_clicks: pick("clicks"),
      ad_ctr: pick("ctr"),
      ad_cpc: pick("cpc"),
      ad_cpm: pick("cpm"),
      ad_conversions: pick("purchases"),
    };
  },
};

const instagramConfig = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("demo"), seed, viralReel: date }),
  z.object({ mode: z.literal("graph"), igUserId: z.string().min(1), accessToken: z.string().min(1) }),
]);

export const instagram: DataSourcePlugin<z.infer<typeof instagramConfig>> = {
  definition: INSTAGRAM,
  config: instagramConfig,
  fromSettings: (settings) => instagramConfig.parse({ mode: "demo", ...settings }),
  isDemo: (config) => config.mode === "demo",
  async fetch({ config, dates, timezone }) {
    const igUserId = config.mode === "demo" ? DEMO_IG_USER : config.igUserId;
    let transport;
    if (config.mode === "demo") {
      const world = simulateInstagram(dates, config.seed, config.viralReel, timezone);
      transport = demoInstagramGraph({ igUserId, dates, timezone, daily: world.daily, media: world.media });
    } else {
      transport = graphApi(config.accessToken);
    }
    const days = await fetchInstagramDaily(transport, igUserId, dates, timezone);
    const values: Record<string, (number | null)[]> = {
      ig_reach: days.map((d) => d.reach),
      ig_feed_posts: days.map((d) => d.posts),
      ig_reels: days.map((d) => d.reels),
    };
    for (const name of INSTAGRAM_DAILY_TOTAL_METRICS) values[`ig_${name}`] = days.map((d) => d[name]);
    return values;
  },
};
