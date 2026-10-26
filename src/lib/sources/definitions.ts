import type { Aggregation } from "../analysis/investigate";
import type { MetricDefinition, SourceDefinition, SourcedMetric } from "./types";

/**
 * いま使えるデータ源 (プラグイン) の説明。画面からも読む。値を取る処理は plugins/ にある
 */

const metric = (
  key: string,
  en: string,
  unit: string,
  aggregation: Aggregation,
  description: string,
  latencyDays = 0,
): MetricDefinition => ({ key, label: { en }, unit, aggregation, description, latencyDays });

/** Instagram の数字は2日遅れでそろうものとする (設計、2026-10-26) */
const INSTAGRAM_LATENCY_DAYS = 2;

export const ORDERS: SourceDefinition = {
  id: "orders",
  label: { en: "Orders" },
  description: { en: "Upload a CSV of orders from your checkout" },
  icon: "orders",
  via: "csv",
  format: "CSV: order_id, created_at, customer_id, total",
  settings: [{ key: "csv", type: "file", label: { en: "Orders CSV" } }],
  dependsOn: [],
  metrics: [
    metric("orders", "Orders", "orders", "sum", "Number of orders placed in the shop (online and in store) that day."),
    metric("revenue", "Revenue", "USD", "sum", "Total sales that day. Equals orders times average order value."),
    metric("average_order_value", "Average order value", "USD", "mean", "Revenue divided by orders that day."),
    metric("new_customers", "New customers", "customers", "sum", "Customers who ordered for the first time that day. A subset of the day's orders."),
    metric("returning_customers", "Returning customers",
      "customers",
      "sum",
      "Customers who had ordered before and ordered again that day. A subset of the day's orders.",
    ),
  ],
};

export const META_ADS: SourceDefinition = {
  id: "meta_ads",
  label: { en: "Meta ads" },
  description: { en: "Spend, impressions, clicks and purchases" },
  icon: "ads",
  via: "api",
  format: "Marketing API Insights",
  settings: [
    { key: "seed", type: "seed", label: { en: "Seed" } },
    { key: "pausedFrom", type: "date", label: { en: "Ads paused from" } },
    { key: "pausedTo", type: "date", label: { en: "Ads paused until" } },
  ],
  dependsOn: [],
  metrics: [
    metric("ad_spend", "Ad spend", "USD", "sum", "Amount spent on Meta (Facebook and Instagram) ads that day."),
    metric("ad_impressions", "Ad impressions", "impressions", "sum", "Times the shop's Meta ads were shown that day."),
    metric("ad_reach", "Ad reach", "people", "sum", "Accounts that saw the shop's Meta ads at least once that day."),
    metric("ad_clicks", "Ad clicks", "clicks", "sum", "Clicks on the shop's Meta ads that day."),
    metric("ad_ctr", "Ad CTR", "%", "mean", "Ad clicks divided by ad impressions that day."),
    metric("ad_cpc", "Ad CPC", "USD", "mean", "Ad spend divided by ad clicks that day."),
    metric("ad_cpm", "Ad CPM", "USD", "mean", "Ad spend per 1,000 impressions that day."),
    metric("ad_conversions", "Ad purchases",
      "orders",
      "sum",
      "Purchases that Meta attributes to the ads that day. These orders are also counted in the shop's orders.",
    ),
  ],
};

export const INSTAGRAM: SourceDefinition = {
  id: "instagram",
  label: { en: "Instagram" },
  description: { en: "Reach, views, reactions and posts" },
  icon: "social",
  via: "api",
  format: "Instagram Graph API",
  settings: [
    { key: "seed", type: "seed", label: { en: "Seed" } },
    { key: "viralReel", type: "date", label: { en: "Reel went viral on" } },
  ],
  dependsOn: [],
  metrics: [
    metric("ig_reach", "Accounts reached", "accounts", "sum", "Accounts that saw any of the shop's content that day.", INSTAGRAM_LATENCY_DAYS),
    metric("ig_views", "Views", "views", "sum", "Views of the shop's posts, reels and stories that day.", INSTAGRAM_LATENCY_DAYS),
    metric("ig_likes", "Likes", "likes", "sum", "Likes on the shop's content that day.", INSTAGRAM_LATENCY_DAYS),
    metric("ig_comments", "Comments", "comments", "sum", "Comments on the shop's content that day.", INSTAGRAM_LATENCY_DAYS),
    metric("ig_saves", "Saves", "saves", "sum", "Saves of the shop's content that day.", INSTAGRAM_LATENCY_DAYS),
    metric("ig_shares", "Shares", "shares", "sum", "Shares of the shop's content that day.", INSTAGRAM_LATENCY_DAYS),
    metric("ig_profile_links_taps", "Profile link taps",
      "taps",
      "sum",
      "Taps on the address, call, email and text buttons in the shop's Instagram profile that day.",
      INSTAGRAM_LATENCY_DAYS,
    ),
    metric("ig_feed_posts", "Feed posts", "posts", "sum", "Feed posts published that day.", INSTAGRAM_LATENCY_DAYS),
    metric("ig_reels", "Reels", "posts", "sum", "Reels published that day.", INSTAGRAM_LATENCY_DAYS),
  ],
};

export const WEATHER: SourceDefinition = {
  id: "weather",
  label: { en: "Weather" },
  description: { en: "Daily temperature and precipitation from NOAA stations" },
  icon: "weather",
  via: "api",
  format: "NOAA GHCN-Daily",
  settings: [{ key: "cityId", type: "city", label: { en: "City" } }],
  dependsOn: [],
  metrics: [
    metric("temp_max", "High temperature", "°C", "mean", "Highest air temperature that day, measured at the city's main airport weather station."),
    metric("temp_min", "Low temperature", "°C", "mean", "Lowest air temperature that day, measured at the city's main airport weather station."),
    metric("precipitation", "Precipitation", "mm", "sum", "Rain and melted snow that day, measured at the city's main airport weather station."),
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
