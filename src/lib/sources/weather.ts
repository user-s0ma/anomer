/**
 * 店の場所の、日別の本物の天気 (Open-Meteo)。
 * 確定した値は過去の天気の API (ERA5、数日遅れで届く) から取り、まだ届いていない直近の日は、
 * 予報の API が返す過去の日の値で埋める。どちらもキーは要らない (非商用の利用)
 */

const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const DAILY = ["temperature_2m_max", "temperature_2m_min", "precipitation_sum", "sunshine_duration"] as const;

export type WeatherDay = {
  date: string;
  tempMax: number | null;
  tempMin: number | null;
  precipitation: number | null;
  /** 時間 (API は秒で返す) */
  sunshine: number | null;
};

type DailyResponse = {
  daily: { time: string[] } & Record<(typeof DAILY)[number], (number | null)[]>;
};

export type Location = { latitude: number; longitude: number; timezone: string };

async function fetchDaily(url: string, location: Location, start: string, end: string): Promise<WeatherDay[]> {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    start_date: start,
    end_date: end,
    daily: DAILY.join(","),
    timezone: location.timezone,
  });
  const response = await fetch(`${url}?${params}`);
  if (!response.ok) throw new Error(`Open-Meteo が ${response.status} を返しました: ${await response.text()}`);
  const body = (await response.json()) as DailyResponse;
  return body.daily.time.map((date, i) => {
    const sunshine = body.daily.sunshine_duration[i];
    return {
      date,
      tempMax: body.daily.temperature_2m_max[i],
      tempMin: body.daily.temperature_2m_min[i],
      precipitation: body.daily.precipitation_sum[i],
      sunshine: sunshine === null ? null : sunshine / 3600,
    };
  });
}

const complete = (day: WeatherDay) =>
  day.tempMax !== null && day.tempMin !== null && day.precipitation !== null && day.sunshine !== null;

/** start〜end (どちらも含む) の日別の天気。返す配列は日付の順 */
export async function fetchWeather(location: Location, start: string, end: string): Promise<WeatherDay[]> {
  const archive = await fetchDaily(ARCHIVE_URL, location, start, end);
  const missing = archive.filter((day) => !complete(day));
  if (missing.length === 0) return archive;

  const recent = await fetchDaily(FORECAST_URL, location, missing[0].date, end);
  const byDate = new Map(recent.map((day) => [day.date, day]));
  return archive.map((day) => (complete(day) ? day : (byDate.get(day.date) ?? day)));
}
