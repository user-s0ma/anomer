import type { Aggregation } from "../analysis/investigate";
import type { MetricDefinition, SourceDefinition, SourcedMetric } from "./types";

/**
 * いま使えるデータ源 (プラグイン) の説明。画面からも読む。値を取る処理は plugins/ にある
 */

const metric = (
  key: string,
  en: string,
  ja: string,
  unit: string,
  aggregation: Aggregation,
  description: string,
  latencyDays = 0,
): MetricDefinition => ({ key, label: { en, ja }, unit, aggregation, description, latencyDays });

/** Instagram の数字は2日遅れでそろうものとする (設計、2026-10-26) */
const INSTAGRAM_LATENCY_DAYS = 2;

export const ORDERS: SourceDefinition = {
  id: "orders",
  label: { en: "Orders", ja: "注文" },
  kind: "simulated",
  modeledOn: "Shop checkout",
  settings: [{ key: "seed", type: "seed", label: { en: "Seed", ja: "乱数の種" } }],
  // 注文は、広告費・プロフィールへの訪問・本物の降水量で動く
  dependsOn: ["meta_ads", "instagram", "weather"],
  metrics: [
    metric("orders", "Orders", "注文数", "orders", "sum", "Number of orders placed in the shop (online and in store) that day."),
    metric("revenue", "Revenue", "売上", "USD", "sum", "Total sales that day. Equals orders times average order value."),
    metric("average_order_value", "Average order value", "客単価", "USD", "mean", "Revenue divided by orders that day."),
    metric("new_customers", "New customers", "新規の客", "customers", "sum", "Customers who ordered for the first time that day. A subset of the day's orders."),
    metric(
      "returning_customers",
      "Returning customers",
      "再来の客",
      "customers",
      "sum",
      "Customers who had ordered before and ordered again that day. A subset of the day's orders.",
    ),
  ],
};

export const META_ADS: SourceDefinition = {
  id: "meta_ads",
  label: { en: "Meta ads", ja: "Meta の広告" },
  kind: "simulated",
  modeledOn: "Meta Marketing API",
  settings: [
    { key: "seed", type: "seed", label: { en: "Seed", ja: "乱数の種" } },
    { key: "pausedFrom", type: "date", label: { en: "Ads paused from", ja: "広告を止めた日" } },
    { key: "pausedTo", type: "date", label: { en: "Ads paused until", ja: "広告を止めた最後の日" } },
  ],
  dependsOn: [],
  metrics: [
    metric("ad_spend", "Ad spend", "広告費", "USD", "sum", "Amount spent on Meta (Facebook and Instagram) ads that day."),
    metric("ad_impressions", "Ad impressions", "広告の表示回数", "impressions", "sum", "Times the shop's Meta ads were shown that day."),
    metric("ad_reach", "Ad reach", "広告のリーチ", "people", "sum", "People who saw the shop's Meta ads at least once that day."),
    metric("ad_clicks", "Ad clicks", "広告のクリック", "clicks", "sum", "Clicks on the shop's Meta ads that day."),
    metric("ad_ctr", "Ad CTR", "広告のクリック率", "%", "mean", "Ad clicks divided by ad impressions that day."),
    metric("ad_cpc", "Ad CPC", "クリック単価", "USD", "mean", "Ad spend divided by ad clicks that day."),
    metric("ad_cpm", "Ad CPM", "1,000回表示の単価", "USD", "mean", "Ad spend per 1,000 impressions that day."),
    metric(
      "ad_conversions",
      "Ad conversions",
      "広告のコンバージョン",
      "orders",
      "sum",
      "Orders that Meta attributes to the ads that day. These orders are also counted in the shop's orders.",
    ),
  ],
};

export const INSTAGRAM: SourceDefinition = {
  id: "instagram",
  label: { en: "Instagram", ja: "Instagram" },
  kind: "simulated",
  modeledOn: "Instagram Graph API",
  settings: [
    { key: "seed", type: "seed", label: { en: "Seed", ja: "乱数の種" } },
    { key: "viralReel", type: "date", label: { en: "Reel went viral on", ja: "リールが伸びた日" } },
  ],
  dependsOn: [],
  metrics: [
    metric("ig_followers", "Followers", "フォロワー数", "followers", "mean", "Instagram followers at the end of the day.", INSTAGRAM_LATENCY_DAYS),
    metric("ig_profile_visits", "Profile visits", "プロフィールへの訪問", "visits", "sum", "Visits to the shop's Instagram profile that day.", INSTAGRAM_LATENCY_DAYS),
    metric("ig_website_taps", "Website taps", "ウェブサイトのタップ", "taps", "sum", "Taps on the website link in the Instagram profile that day.", INSTAGRAM_LATENCY_DAYS),
    metric("ig_feed_posts", "Feed posts", "フィードの投稿", "posts", "sum", "Feed posts published that day.", INSTAGRAM_LATENCY_DAYS),
    metric("ig_reels", "Reels", "リール", "posts", "sum", "Reels published that day.", INSTAGRAM_LATENCY_DAYS),
    metric("ig_stories", "Stories", "ストーリー", "posts", "sum", "Stories published that day.", INSTAGRAM_LATENCY_DAYS),
    metric("ig_views", "Post views", "投稿の表示", "views", "sum", "Views of all the shop's posts, reels and stories that day.", INSTAGRAM_LATENCY_DAYS),
    metric("ig_reach", "Post reach", "投稿のリーチ", "accounts", "sum", "Accounts that saw any of the shop's posts that day.", INSTAGRAM_LATENCY_DAYS),
    metric("ig_likes", "Likes", "いいね", "likes", "sum", "Likes on the shop's posts that day.", INSTAGRAM_LATENCY_DAYS),
    metric("ig_saves", "Saves", "保存", "saves", "sum", "Saves of the shop's posts that day.", INSTAGRAM_LATENCY_DAYS),
    metric("ig_shares", "Shares", "シェア", "shares", "sum", "Shares of the shop's posts that day.", INSTAGRAM_LATENCY_DAYS),
  ],
};

export const WEATHER: SourceDefinition = {
  id: "weather",
  label: { en: "Weather", ja: "天気" },
  kind: "live",
  modeledOn: "NOAA GHCN-Daily",
  settings: [{ key: "cityId", type: "city", label: { en: "City", ja: "都市" } }],
  dependsOn: [],
  metrics: [
    metric("temp_max", "High temperature", "最高気温", "°C", "mean", "Highest air temperature that day, measured at the city's main airport weather station."),
    metric("temp_min", "Low temperature", "最低気温", "°C", "mean", "Lowest air temperature that day, measured at the city's main airport weather station."),
    metric("precipitation", "Precipitation", "降水量", "mm", "sum", "Rain and melted snow that day, measured at the city's main airport weather station."),
  ],
};

export const SOURCES: SourceDefinition[] = [ORDERS, META_ADS, INSTAGRAM, WEATHER];

export const SOURCE_BY_ID = new Map(SOURCES.map((source) => [source.id, source]));

/** データ源の数字を、どのデータ源のものかをつけて並べる */
export function sourcedMetrics(sources: SourceDefinition[]): SourcedMetric[] {
  return sources.flatMap((source) => source.metrics.map((m) => ({ ...m, source: source.id })));
}

/** 数字の名前から、その説明と、どのデータ源のものか (画面で名前を出すのに使う) */
export const METRIC_BY_KEY = new Map(sourcedMetrics(SOURCES).map((m) => [m.key, m]));
