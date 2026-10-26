/**
 * 架空の店の「本当の値」を作るシミュレーター (デモ用)。広告・Instagram の日別の値と、注文の一件ずつを作る。
 * データ源はこれを直接読まず、ここから作った Graph API と同じ形の応答 (meta/demo.ts) と注文の CSV (shop/setup.ts) を、
 * 本物と同じ読み込み処理で読む。注文は広告費・Instagram の表示・本物の天気 (雨) で動く。
 * 同じ seed と入力からは、いつ作っても同じ値になる (日ごとに乱数を作るので、日を足しても過去は変わらない)。
 *
 * 仕込んだ原因 (あとで AI の答えと比べる):
 * - 広告を止めた期間 (広告費が0になり、1〜2日遅れで注文が減る)
 * - リールが伸びた日 (表示が跳ね、その日と翌日の注文が増える)
 * - 給料日 (毎月1日と15日、その日と翌日に注文が増える)
 * - 雨 (降水量に比例して来店が減る。NOAA が降水量を出していない日は、雨の影響を入れない)
 * - 曜日 (週末に増える)、ゆるやかな成長
 */

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

/** 日付と名前から、その日だけの乱数を作る */
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

function table(keys: string[], n: number) {
  return Object.fromEntries(keys.map((key) => [key, new Array<number>(n)])) as Record<string, number[]>;
}

/** 広告が呼ぶ注文の見込み (1日前と2日前の広告費から)。最初の2日は予算どおりに出していたものとする */
function adDrivenOrders(spend: number[], t: number) {
  return SHOP.adOrdersPerDollarLag1 * (spend[t - 1] ?? SHOP.adBudget) + SHOP.adOrdersPerDollarLag2 * (spend[t - 2] ?? SHOP.adBudget);
}

/** 日予算を見直す間隔 (日)。実際の店のように、4週間ごとに予算を上げ下げする */
const BUDGET_PERIOD_DAYS = 28;

/** その日の日予算。1970-01-01 から数えた4週間ごとに、平均の 0.6〜1.4 倍のどこかに決める */
function dailyBudget(seed: number, date: string) {
  const period = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000 / BUDGET_PERIOD_DAYS);
  return SHOP.adBudget * (0.6 + 0.8 * dailyRandom(seed, String(period), "budget")());
}

/** Meta の広告。paused の期間は広告を止める */
export function simulateAds(dates: string[], seed: number, paused: { start: string; end: string }) {
  const out = table(["ad_spend", "ad_impressions", "ad_reach", "ad_clicks", "ad_ctr", "ad_cpc", "ad_cpm", "ad_conversions"], dates.length);
  dates.forEach((date, t) => {
    const rand = dailyRandom(seed, date, "ads");
    const budget = dailyBudget(seed, date);
    const spend = date >= paused.start && date <= paused.end ? 0 : Math.max(0, budget * (1 + 0.06 * normal(rand)));
    const cpm = 8.5 * (1 + 0.08 * normal(rand));
    const impressions = spend === 0 ? 0 : Math.round((spend / cpm) * 1000);
    const clicks = poisson(rand, impressions * 0.011 * (1 + 0.1 * normal(rand)));
    out.ad_spend[t] = r2(spend);
    out.ad_impressions[t] = impressions;
    out.ad_reach[t] = Math.round(impressions / (1.55 + 0.1 * rand()));
    out.ad_clicks[t] = clicks;
    out.ad_ctr[t] = impressions === 0 ? 0 : r2((clicks / impressions) * 100);
    out.ad_cpc[t] = clicks === 0 ? 0 : r2(spend / clicks);
    out.ad_cpm[t] = impressions === 0 ? 0 : r2((spend / impressions) * 1000);
  });
  // Meta が広告のおかげとみなす注文 (広告が呼んだ注文の見込みの7割ほど)
  dates.forEach((date, t) => {
    out.ad_conversions[t] = poisson(dailyRandom(seed, date, "conversions"), adDrivenOrders(out.ad_spend, t) * 0.7);
  });
  return out;
}

const offsets = new Map<string, number>();

/** その日の、タイムゾーンの UTC からの時差 (ミリ秒)。日付とタイムゾーンごとに1回だけ計算する */
function utcOffsetMs(date: string, timezone: string) {
  const key = `${timezone}:${date}`;
  let offset = offsets.get(key);
  if (offset === undefined) {
    const noon = new Date(`${date}T12:00:00Z`);
    offset = new Date(noon.toLocaleString("en-US", { timeZone: timezone })).getTime() - noon.getTime();
    offsets.set(key, offset);
  }
  return offset;
}

/** その日のタイムゾーンでの hour 時を、UTC の ISO 8601 にする */
export function localTimeToIso(date: string, hour: number, timezone: string) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + hour * 3_600_000 - utcOffsetMs(date, timezone)).toISOString();
}

/** Instagram の投稿 (投稿の一覧に出るもの) */
export type SimulatedMedia = { id: string; timestamp: string; media_product_type: "FEED" | "REELS" };

/** 表示からの、プロフィールへの訪問の見込み (注文を呼ぶ) */
function profileVisits(views: number) {
  return SHOP.baseProfileVisits + views * 0.018;
}

/** Instagram。viralReel の日にリールが大きく伸びる。日別の値と、投稿の一覧を返す */
export function simulateInstagram(dates: string[], seed: number, viralReel: string, timezone: string) {
  const out = table(["reach", "views", "likes", "comments", "saves", "shares", "profile_links_taps"], dates.length);
  const media: SimulatedMedia[] = [];
  dates.forEach((date, t) => {
    const rand = dailyRandom(seed, date, "instagram");
    const feedPosts = rand() < 0.35 ? 1 : 0;
    const isViral = date === viralReel;
    const reels = isViral || rand() < 0.18 ? 1 : 0;
    const views = Math.round(
      feedPosts * 900 * (1 + 0.3 * normal(rand)) + reels * 2600 * (1 + 0.4 * Math.abs(normal(rand))) + 900 + (isViral ? SHOP.viralViews : 0),
    );
    out.views[t] = views;
    out.reach[t] = Math.round(views * (0.62 + 0.05 * rand()));
    out.likes[t] = poisson(rand, views * 0.035);
    out.comments[t] = poisson(rand, views * 0.003);
    out.saves[t] = poisson(rand, views * 0.004);
    out.shares[t] = poisson(rand, views * 0.002);
    out.profile_links_taps[t] = poisson(rand, profileVisits(views) * 0.05);
    if (feedPosts) media.push({ id: `${seed}-${date}-feed`, timestamp: localTimeToIso(date, 9, timezone), media_product_type: "FEED" });
    if (reels) media.push({ id: `${seed}-${date}-reel`, timestamp: localTimeToIso(date, 18, timezone), media_product_type: "REELS" });
  });
  return { daily: out, media };
}

/** 注文の一件 (CSV の1行になる) */
export type SimulatedOrder = { id: string; createdAt: string; customerId: string; total: number };

/** 注文を一件ずつ作る。広告費・Instagram の表示・降水量 (届いていない日は null) で動く */
export function simulateOrders(
  dates: string[],
  seed: number,
  timezone: string,
  inputs: { adSpend: number[]; igViews: number[]; precipitation: (number | null)[] },
) {
  const orders: SimulatedOrder[] = [];
  const customers: string[] = [];
  dates.forEach((date, t) => {
    const rand = dailyRandom(seed, date, "orders");
    const day = Number(date.slice(8, 10));
    const dow = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
    const growth = 1 + SHOP.growthPerYear * (t / 365);
    const payday = [1, 2, 15, 16].includes(day) ? 1 + SHOP.paydayLift : 1;
    const rain = inputs.precipitation[t];
    const rainFactor = rain === null ? 1 : Math.max(SHOP.rainFloor, 1 - SHOP.rainPerMm * rain);
    const visits = profileVisits(inputs.igViews[t]);
    const visitsBefore = t > 0 ? profileVisits(inputs.igViews[t - 1]) : SHOP.baseProfileVisits;
    const igOrders = SHOP.ordersPerProfileVisit * (visits + 0.5 * visitsBefore);
    const expected = SHOP.baseOrders * growth * SHOP.dayOfWeek[dow] * payday * rainFactor + adDrivenOrders(inputs.adSpend, t) + igOrders;
    const count = poisson(rand, expected);
    for (let k = 0; k < count; k++) {
      // 新しい客か、前に来た客か
      let customerId: string;
      if (customers.length === 0 || rand() < SHOP.newCustomerShare) {
        customerId = `C${String(customers.length + 1).padStart(6, "0")}`;
        customers.push(customerId);
      } else {
        customerId = customers[Math.floor(rand() * customers.length)];
      }
      orders.push({
        id: `${date.replaceAll("-", "")}-${String(k + 1).padStart(4, "0")}`,
        // 7時から19時のどこか
        createdAt: localTimeToIso(date, 7 + rand() * 12, timezone),
        customerId,
        total: r2(SHOP.averageOrderValue * (1 + 0.25 * normal(rand))),
      });
    }
  });
  return orders;
}
