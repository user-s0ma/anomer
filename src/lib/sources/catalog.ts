import type { Aggregation } from "../analysis/investigate";

/**
 * データ源 (プラグイン) と、それぞれが返す数字の説明。
 * 本体はデータ源のことを知らず、ここに書いた説明と日別の値だけを使う。description は AI が読む
 */

export type SourceId = "meta_ads" | "instagram" | "orders" | "weather";

export type MetricDefinition = {
  key: string;
  source: SourceId;
  label: { en: string; ja: string };
  /** AI が読む説明 (英語) */
  description: string;
  unit: string;
  aggregation: Aggregation;
  /** 値が届くまでの日数。この日数より新しい日は、まだ値がない */
  latencyDays: number;
};

export type SourceDefinition = {
  id: SourceId;
  label: { en: string; ja: string };
  /** 本物のデータか、形だけ本物に合わせたシミュレーターか */
  kind: "live" | "simulated";
  /** 形を合わせた API */
  modeledOn: string;
};

export const SOURCES: SourceDefinition[] = [
  { id: "orders", label: { en: "Orders", ja: "注文" }, kind: "simulated", modeledOn: "Daily order totals from the shop's checkout" },
  { id: "meta_ads", label: { en: "Meta ads", ja: "Meta の広告" }, kind: "simulated", modeledOn: "Meta Marketing API (Insights)" },
  { id: "instagram", label: { en: "Instagram", ja: "Instagram" }, kind: "simulated", modeledOn: "Instagram Graph API (insights)" },
  { id: "weather", label: { en: "Weather", ja: "天気" }, kind: "live", modeledOn: "NOAA NCEI daily summaries (GHCN-Daily)" },
];

const metric = (
  source: SourceId,
  key: string,
  en: string,
  ja: string,
  unit: string,
  aggregation: Aggregation,
  description: string,
  latencyDays = 0,
): MetricDefinition => ({ key, source, label: { en, ja }, unit, aggregation, description, latencyDays });

/** Instagram の数字は2日遅れでそろうものとする (設計、2026-10-26) */
const INSTAGRAM_LATENCY_DAYS = 2;

export const METRICS: MetricDefinition[] = [
  metric("orders", "orders", "Orders", "注文数", "orders", "sum", "Number of orders placed in the shop (online and in store) that day."),
  metric("orders", "revenue", "Revenue", "売上", "USD", "sum", "Total sales that day. Equals orders times average order value."),
  metric("orders", "average_order_value", "Average order value", "客単価", "USD", "mean", "Revenue divided by orders that day."),
  metric("orders", "new_customers", "New customers", "新規の客", "customers", "sum", "Customers who ordered for the first time that day. A subset of the day's orders."),
  metric("orders", "returning_customers", "Returning customers", "再来の客", "customers", "sum", "Customers who had ordered before and ordered again that day. A subset of the day's orders."),

  metric("meta_ads", "ad_spend", "Ad spend", "広告費", "USD", "sum", "Amount spent on Meta (Facebook and Instagram) ads that day."),
  metric("meta_ads", "ad_impressions", "Ad impressions", "広告の表示回数", "impressions", "sum", "Times the shop's Meta ads were shown that day."),
  metric("meta_ads", "ad_reach", "Ad reach", "広告のリーチ", "people", "sum", "People who saw the shop's Meta ads at least once that day."),
  metric("meta_ads", "ad_clicks", "Ad clicks", "広告のクリック", "clicks", "sum", "Clicks on the shop's Meta ads that day."),
  metric("meta_ads", "ad_ctr", "Ad CTR", "広告のクリック率", "%", "mean", "Ad clicks divided by ad impressions that day."),
  metric("meta_ads", "ad_cpc", "Ad CPC", "クリック単価", "USD", "mean", "Ad spend divided by ad clicks that day."),
  metric("meta_ads", "ad_cpm", "Ad CPM", "1,000回表示の単価", "USD", "mean", "Ad spend per 1,000 impressions that day."),
  metric(
    "meta_ads",
    "ad_conversions",
    "Ad conversions",
    "広告のコンバージョン",
    "orders",
    "sum",
    "Orders that Meta attributes to the ads that day. These orders are also counted in the shop's orders.",
  ),

  metric("instagram", "ig_followers", "Followers", "フォロワー数", "followers", "mean", "Instagram followers at the end of the day.", INSTAGRAM_LATENCY_DAYS),
  metric("instagram", "ig_profile_visits", "Profile visits", "プロフィールへの訪問", "visits", "sum", "Visits to the shop's Instagram profile that day.", INSTAGRAM_LATENCY_DAYS),
  metric("instagram", "ig_website_taps", "Website taps", "ウェブサイトのタップ", "taps", "sum", "Taps on the website link in the Instagram profile that day.", INSTAGRAM_LATENCY_DAYS),
  metric("instagram", "ig_feed_posts", "Feed posts", "フィードの投稿", "posts", "sum", "Feed posts published that day.", INSTAGRAM_LATENCY_DAYS),
  metric("instagram", "ig_reels", "Reels", "リール", "posts", "sum", "Reels published that day.", INSTAGRAM_LATENCY_DAYS),
  metric("instagram", "ig_stories", "Stories", "ストーリー", "posts", "sum", "Stories published that day.", INSTAGRAM_LATENCY_DAYS),
  metric("instagram", "ig_views", "Post views", "投稿の表示", "views", "sum", "Views of all the shop's posts, reels and stories that day.", INSTAGRAM_LATENCY_DAYS),
  metric("instagram", "ig_reach", "Post reach", "投稿のリーチ", "accounts", "sum", "Accounts that saw any of the shop's posts that day.", INSTAGRAM_LATENCY_DAYS),
  metric("instagram", "ig_likes", "Likes", "いいね", "likes", "sum", "Likes on the shop's posts that day.", INSTAGRAM_LATENCY_DAYS),
  metric("instagram", "ig_saves", "Saves", "保存", "saves", "sum", "Saves of the shop's posts that day.", INSTAGRAM_LATENCY_DAYS),
  metric("instagram", "ig_shares", "Shares", "シェア", "shares", "sum", "Shares of the shop's posts that day.", INSTAGRAM_LATENCY_DAYS),

  metric("weather", "temp_max", "High temperature", "最高気温", "°C", "mean", "Highest air temperature that day, measured at the city's main airport weather station."),
  metric("weather", "temp_min", "Low temperature", "最低気温", "°C", "mean", "Lowest air temperature that day, measured at the city's main airport weather station."),
  metric("weather", "precipitation", "Precipitation", "降水量", "mm", "sum", "Rain and melted snow that day, measured at the city's main airport weather station."),
];

export const METRIC_BY_KEY = new Map(METRICS.map((m) => [m.key, m]));
