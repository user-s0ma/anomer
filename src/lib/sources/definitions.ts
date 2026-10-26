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
  description: { en: "Upload a CSV of orders from your checkout", ja: "レジや通販の注文の CSV を上げる" },
  icon: "orders",
  via: "csv",
  format: "CSV: order_id, created_at, customer_id, total",
  settings: [{ key: "csv", type: "file", label: { en: "Orders CSV", ja: "注文の CSV" } }],
  dependsOn: [],
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
  description: { en: "Spend, impressions, clicks and purchases", ja: "広告の費用・表示・クリック・購入" },
  icon: "ads",
  via: "api",
  format: "Marketing API Insights",
  settings: [
    { key: "seed", type: "seed", label: { en: "Seed", ja: "乱数の種" } },
    { key: "pausedFrom", type: "date", label: { en: "Ads paused from", ja: "広告を止めた日" } },
    { key: "pausedTo", type: "date", label: { en: "Ads paused until", ja: "広告を止めた最後の日" } },
  ],
  dependsOn: [],
  metrics: [
    metric("ad_spend", "Ad spend", "広告費", "USD", "sum", "Amount spent on Meta (Facebook and Instagram) ads that day."),
    metric("ad_impressions", "Ad impressions", "広告の表示回数", "impressions", "sum", "Times the shop's Meta ads were shown that day."),
    metric("ad_reach", "Ad reach", "広告のリーチ", "people", "sum", "Accounts that saw the shop's Meta ads at least once that day."),
    metric("ad_clicks", "Ad clicks", "広告のクリック", "clicks", "sum", "Clicks on the shop's Meta ads that day."),
    metric("ad_ctr", "Ad CTR", "広告のクリック率", "%", "mean", "Ad clicks divided by ad impressions that day."),
    metric("ad_cpc", "Ad CPC", "クリック単価", "USD", "mean", "Ad spend divided by ad clicks that day."),
    metric("ad_cpm", "Ad CPM", "1,000回表示の単価", "USD", "mean", "Ad spend per 1,000 impressions that day."),
    metric(
      "ad_conversions",
      "Ad purchases",
      "広告からの購入",
      "orders",
      "sum",
      "Purchases that Meta attributes to the ads that day. These orders are also counted in the shop's orders.",
    ),
  ],
};

export const INSTAGRAM: SourceDefinition = {
  id: "instagram",
  label: { en: "Instagram", ja: "Instagram" },
  description: { en: "Reach, views, reactions and posts", ja: "リーチ・表示・反応・投稿" },
  icon: "social",
  via: "api",
  format: "Instagram Graph API",
  settings: [
    { key: "seed", type: "seed", label: { en: "Seed", ja: "乱数の種" } },
    { key: "viralReel", type: "date", label: { en: "Reel went viral on", ja: "リールが伸びた日" } },
  ],
  dependsOn: [],
  metrics: [
    metric("ig_reach", "Accounts reached", "リーチ", "accounts", "sum", "Accounts that saw any of the shop's content that day.", INSTAGRAM_LATENCY_DAYS),
    metric("ig_views", "Views", "表示", "views", "sum", "Views of the shop's posts, reels and stories that day.", INSTAGRAM_LATENCY_DAYS),
    metric("ig_likes", "Likes", "いいね", "likes", "sum", "Likes on the shop's content that day.", INSTAGRAM_LATENCY_DAYS),
    metric("ig_comments", "Comments", "コメント", "comments", "sum", "Comments on the shop's content that day.", INSTAGRAM_LATENCY_DAYS),
    metric("ig_saves", "Saves", "保存", "saves", "sum", "Saves of the shop's content that day.", INSTAGRAM_LATENCY_DAYS),
    metric("ig_shares", "Shares", "シェア", "shares", "sum", "Shares of the shop's content that day.", INSTAGRAM_LATENCY_DAYS),
    metric(
      "ig_profile_links_taps",
      "Profile link taps",
      "プロフィールのリンクのタップ",
      "taps",
      "sum",
      "Taps on the address, call, email and text buttons in the shop's Instagram profile that day.",
      INSTAGRAM_LATENCY_DAYS,
    ),
    metric("ig_feed_posts", "Feed posts", "フィードの投稿", "posts", "sum", "Feed posts published that day.", INSTAGRAM_LATENCY_DAYS),
    metric("ig_reels", "Reels", "リール", "posts", "sum", "Reels published that day.", INSTAGRAM_LATENCY_DAYS),
  ],
};

export const WEATHER: SourceDefinition = {
  id: "weather",
  label: { en: "Weather", ja: "天気" },
  description: { en: "Daily temperature and precipitation from NOAA stations", ja: "NOAA の観測所の日別の気温と降水量" },
  icon: "weather",
  via: "api",
  format: "NOAA GHCN-Daily",
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
