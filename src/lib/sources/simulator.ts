import type { WeatherDay } from "./weather";

/**
 * 架空の店の数字を作るシミュレーター。広告・Instagram・注文の数字を、形だけ本物の API に合わせて返す。
 * 注文は本物の天気 (雨) でも動く。同じ seed と天気からは、いつ作っても同じ数字になる。
 *
 * 仕込んだ原因 (あとで AI の答えと比べる):
 * - 広告を止めた期間 (広告費が0になり、1〜2日遅れで注文が減る)
 * - リールが伸びた日 (プロフィールへの訪問が跳ね、その日と翌日の注文が増える)
 * - 給料日 (毎月1日と15日、その日と翌日に注文が増える)
 * - 雨 (降水量に比例して来店が減る。NOAA が降水量を出していない日は、雨の影響を入れない)
 * - 曜日 (週末に増える)、ゆるやかな成長
 */

export type SimulationEvents = {
  adsPaused: { start: string; end: string };
  viralReel: string;
};

/** 再現できる乱数 (mulberry32) */
function generator(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 日付と数字の名前から、その日だけの乱数を作る (日を足しても過去の値が変わらないように) */
function dailyRandom(seed: number, date: string, name: string) {
  let h = seed >>> 0;
  for (const ch of `${date}:${name}`) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  const rand = generator(h);
  rand();
  return rand;
}

function normal(rand: () => number) {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}

function poisson(rand: () => number, lambda: number) {
  if (lambda <= 0) return 0;
  // 大きい λ は正規分布で近似する
  if (lambda > 50) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * normal(rand)));
  const limit = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > limit);
  return k - 1;
}

/** 店の性格 */
const SHOP = {
  baseOrders: 95,
  growthPerYear: 0.18,
  /** 月曜から日曜の倍率 */
  dayOfWeek: [0.86, 0.9, 0.95, 1.0, 1.12, 1.32, 1.2],
  paydayLift: 0.14,
  rainPerMm: 0.018,
  rainFloor: 0.6,
  adBudget: 55,
  adOrdersPerDollarLag1: 0.24,
  adOrdersPerDollarLag2: 0.12,
  ordersPerProfileVisit: 0.045,
  averageOrderValue: 16.5,
  newCustomerShare: 0.32,
  baseProfileVisits: 140,
  viralViews: 180_000,
};

const r2 = (value: number) => Math.round(value * 100) / 100;

export function simulate(dates: string[], weather: WeatherDay[], seed: number, events: SimulationEvents) {
  const n = dates.length;
  const out: Record<string, number[]> = {};
  const put = (key: string, t: number, value: number) => {
    (out[key] ??= new Array<number>(n))[t] = value;
  };

  let followers = 2400;
  const adSpend: number[] = [];
  const profileVisits: number[] = [];

  for (let t = 0; t < n; t++) {
    const date = dates[t];
    const rand = dailyRandom(seed, date, "day");

    // --- Meta の広告
    const paused = date >= events.adsPaused.start && date <= events.adsPaused.end;
    const spend = paused ? 0 : Math.max(0, SHOP.adBudget * (1 + 0.06 * normal(rand)));
    const cpm = 8.5 * (1 + 0.08 * normal(rand));
    const impressions = spend === 0 ? 0 : Math.round((spend / cpm) * 1000);
    const reach = Math.round(impressions / (1.55 + 0.1 * rand()));
    const ctr = 0.011 * (1 + 0.1 * normal(rand));
    const clicks = poisson(rand, impressions * ctr);
    adSpend.push(spend);

    // --- Instagram
    const feedPosts = rand() < 0.35 ? 1 : 0;
    const isViral = date === events.viralReel;
    const reels = isViral || rand() < 0.18 ? 1 : 0;
    const stories = poisson(rand, 1.4);
    const views = Math.round(
      feedPosts * 900 * (1 + 0.3 * normal(rand)) +
        reels * 2600 * (1 + 0.4 * Math.abs(normal(rand))) +
        stories * 380 +
        600 +
        (isViral ? SHOP.viralViews : 0),
    );
    const igReach = Math.round(views * (0.62 + 0.05 * rand()));
    const visits = poisson(rand, SHOP.baseProfileVisits + views * 0.018);
    profileVisits.push(visits);
    followers += poisson(rand, 4 + views * 0.0022);

    // --- 注文
    const day = Number(date.slice(8, 10));
    const dow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
    const growth = 1 + SHOP.growthPerYear * (t / 365);
    const payday = [1, 2, 15, 16].includes(day) ? 1 + SHOP.paydayLift : 1;
    const rain = weather[t].precipitation;
    const rainFactor = rain === null ? 1 : Math.max(SHOP.rainFloor, 1 - SHOP.rainPerMm * rain);
    const adOrders =
      SHOP.adOrdersPerDollarLag1 * (adSpend[t - 1] ?? SHOP.adBudget) + SHOP.adOrdersPerDollarLag2 * (adSpend[t - 2] ?? SHOP.adBudget);
    const igOrders = SHOP.ordersPerProfileVisit * (visits + 0.5 * (profileVisits[t - 1] ?? SHOP.baseProfileVisits));
    const expected = SHOP.baseOrders * growth * SHOP.dayOfWeek[dow] * payday * rainFactor + adOrders + igOrders;
    const orders = poisson(rand, expected);
    const aov = SHOP.averageOrderValue * (1 + 0.04 * normal(rand));
    const newCustomers = Math.round(orders * SHOP.newCustomerShare * (1 + 0.1 * normal(rand)));

    put("ad_spend", t, r2(spend));
    put("ad_impressions", t, impressions);
    put("ad_reach", t, reach);
    put("ad_clicks", t, clicks);
    put("ad_ctr", t, impressions === 0 ? 0 : r2((clicks / impressions) * 100));
    put("ad_cpc", t, clicks === 0 ? 0 : r2(spend / clicks));
    put("ad_cpm", t, impressions === 0 ? 0 : r2((spend / impressions) * 1000));
    put("ad_conversions", t, Math.min(orders, poisson(rand, adOrders * 0.7)));

    put("ig_followers", t, followers);
    put("ig_profile_visits", t, visits);
    put("ig_website_taps", t, poisson(rand, visits * 0.09));
    put("ig_feed_posts", t, feedPosts);
    put("ig_reels", t, reels);
    put("ig_stories", t, stories);
    put("ig_views", t, views);
    put("ig_reach", t, igReach);
    put("ig_likes", t, poisson(rand, views * 0.035));
    put("ig_saves", t, poisson(rand, views * 0.004));
    put("ig_shares", t, poisson(rand, views * 0.002));

    put("orders", t, orders);
    put("revenue", t, r2(orders * aov));
    put("average_order_value", t, orders === 0 ? 0 : r2(aov));
    put("new_customers", t, Math.min(orders, Math.max(0, newCustomers)));
    put("returning_customers", t, orders - Math.min(orders, Math.max(0, newCustomers)));
  }
  return out;
}
