import { CITY_BY_ID } from "../sources/cities";
import { ORDER_CSV_COLUMNS } from "../sources/orders-csv";
import { collect, type Connection } from "../sources/registry";
import { simulateAds, simulateInstagram, simulateOrders } from "../sources/simulator";
import { addDays, dateRange, todayIn } from "../util/dates";
import { createShop, type SourceInput } from "./service";

/**
 * 新しい店に、最初のデータ源をつなぐ。天気は選んだ都市の本物。広告と Instagram はデモのデータを
 * Graph API と同じ形で返す接続、注文はデモのデータで作った CSV を上げる。
 * デモのデータには、AI の答えと比べるための原因を仕込む
 */

/** データを持つ日数 (Lasso の当てはめに約1年分、月の中の日が12回ずつ見られるように) */
const HISTORY_DAYS = 400;

/** お試しの店 (架空)。天気は本物の Portland のもの */
export const DEMO_SHOP = { name: "Juniper & Rye Bakery", cityId: "portland", seed: 20261027 };

/** 注文の一件ずつを CSV にする */
function ordersCsv(orders: ReturnType<typeof simulateOrders>) {
  const lines = orders.map((order) => [order.id, order.createdAt, order.customerId, order.total.toFixed(2)].join(","));
  return [ORDER_CSV_COLUMNS.join(","), ...lines].join("\n");
}

/**
 * 仕込む原因の日付は、天気が届いている最後の日 (anchor) を基準に、広告を止めた週は1〜2週間前、
 * リールが伸びた日は約4週間前に置く (「先週」「先月」と聞いたときに見つかる位置)
 */
export async function starterSources(cityId: string, timezone: string, seed: number, anchor: string, dataStart: string): Promise<SourceInput[]> {
  const pausedFrom = addDays(anchor, -12);
  const pausedTo = addDays(anchor, -6);
  const viralReel = addDays(anchor, -26);

  // 注文は、広告と Instagram のデモの本当の値と、本物の雨で動く
  const dates = dateRange(dataStart, anchor);
  const weather = await collect([{ sourceId: "weather", config: { cityId } }], dates, { timezone, uploads: new Map() });
  const ads = simulateAds(dates, seed, { start: pausedFrom, end: pausedTo });
  const instagram = simulateInstagram(dates, seed, viralReel, timezone);
  const orders = simulateOrders(dates, seed, timezone, {
    adSpend: ads.ad_spend,
    igViews: instagram.daily.views,
    precipitation: weather.precipitation,
  });

  return [
    { sourceId: "weather", settings: { cityId } },
    { sourceId: "meta_ads", settings: { seed, pausedFrom, pausedTo } },
    { sourceId: "instagram", settings: { seed, viralReel } },
    { sourceId: "orders", settings: {}, file: { name: "demo-orders.csv", text: ordersCsv(orders), demo: true } },
  ];
}

export async function createStarterShop(env: AppEnv, userId: string, input: { name: string; cityId: string }, seed: number) {
  const city = CITY_BY_ID.get(input.cityId);
  if (!city) throw new Error(`知らない都市です: ${input.cityId}`);
  // 天気が届いている最後の日 (直近30日から探す)
  const yesterday = addDays(todayIn(city.timezone), -1);
  const recent = dateRange(addDays(yesterday, -29), yesterday);
  const weather = await collect([{ sourceId: "weather", config: { cityId: city.id } }], recent, { timezone: city.timezone, uploads: new Map() });
  const lastIndex = weather.precipitation.findLastIndex((_, i) => weather.temp_max[i] !== null || weather.precipitation[i] !== null);
  if (lastIndex < 0) throw new Error(`${city.label} の直近の天気が取れませんでした`);
  const anchor = recent[lastIndex];
  const dataStart = addDays(anchor, -HISTORY_DAYS);

  return createShop(
    env,
    { userId, name: input.name, city: city.label, timezone: city.timezone, dataStart },
    await starterSources(city.id, city.timezone, seed, anchor, dataStart),
  );
}

/** 聞いてみる質問の例。仕込んだ原因の日付に合わせる (広告は止めた翌日から効く) */
export function suggestedQuestions(connections: Connection[], locale: Locale) {
  const day = (date: string) => new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
  const configOf = (id: string) => connections.find((c) => c.sourceId === id)?.config as Record<string, string> | undefined;
  const ads = configOf("meta_ads");
  const instagram = configOf("instagram");
  const questions: string[] = [];
  if (ads) {
    const from = day(addDays(ads.pausedFrom, 1));
    const to = day(addDays(ads.pausedTo, 1));
    questions.push(locale === "ja" ? `${from}〜${to}の注文が減ったのはなぜ？` : `Why did orders drop ${from}–${to}?`);
  }
  if (instagram) {
    questions.push(locale === "ja" ? `${day(instagram.viralReel)}に注文が跳ねたのはなぜ？` : `Why did orders jump on ${day(instagram.viralReel)}?`);
  }
  questions.push(locale === "ja" ? "先週の売上が変わったのはなぜ？" : "Why did revenue change last week?");
  if (instagram) questions.push(locale === "ja" ? "先月、ウェブサイトのタップが増えたのはなぜ？" : "Why did website taps rise last month?");
  return questions;
}
