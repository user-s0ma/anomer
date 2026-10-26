/**
 * 店の場所の、日別の本物の天気。米国海洋大気庁 (NOAA) の国立環境情報センター (NCEI) が公開する
 * GHCN-Daily (Global Historical Climatology Network daily) を、キーの要らない Access Data Service から取る。
 * 米国政府の著作物なので、使う権利に制約はない。観測所から数日遅れで届き、まだ届いていない日は返らない
 */

const NCEI_URL = "https://www.ncei.noaa.gov/access/services/data/v1";

export type WeatherDay = {
  date: string;
  /** °C */
  tempMax: number | null;
  tempMin: number | null;
  /** mm */
  precipitation: number | null;
};

type Record = { DATE: string; TMAX?: string; TMIN?: string; PRCP?: string };

const numberOrNull = (value: string | undefined) => (value === undefined || value.trim() === "" ? null : Number(value));

/** start〜end (どちらも含む) の、観測所の日別の天気。観測が届いている日だけを日付の順に返す */
export async function fetchWeather(station: string, start: string, end: string): Promise<WeatherDay[]> {
  const params = new URLSearchParams({
    dataset: "daily-summaries",
    stations: station,
    startDate: start,
    endDate: end,
    dataTypes: "TMAX,TMIN,PRCP",
    units: "metric",
    format: "json",
  });
  const response = await fetch(`${NCEI_URL}?${params}`);
  if (!response.ok) throw new Error(`NOAA NCEI が ${response.status} を返しました: ${await response.text()}`);
  const records = (await response.json()) as Record[];
  return records
    .map((r) => ({ date: r.DATE, tempMax: numberOrNull(r.TMAX), tempMin: numberOrNull(r.TMIN), precipitation: numberOrNull(r.PRCP) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
