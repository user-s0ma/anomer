import { z } from "zod";
import { CITY_BY_ID } from "../cities";
import { WEATHER } from "../definitions";
import type { DataSourcePlugin } from "../types";
import { fetchWeather } from "../weather";

/** 本物の天気 (NOAA の観測所の日別の値)。店の都市の観測所から取る */
export const weatherPlugin: DataSourcePlugin<{ cityId: string }> = {
  definition: WEATHER,
  config: z.object({ cityId: z.string().refine((id) => CITY_BY_ID.has(id), "unknown city") }),
  dependsOn: [],
  async fetch({ config, dates }) {
    const city = CITY_BY_ID.get(config.cityId)!;
    const days = await fetchWeather(city.station, dates[0], dates[dates.length - 1]);
    const byDate = new Map(days.map((day) => [day.date, day]));
    // 観測が欠けた日と、まだ届いていない日は null
    return {
      temp_max: dates.map((date) => byDate.get(date)?.tempMax ?? null),
      temp_min: dates.map((date) => byDate.get(date)?.tempMin ?? null),
      precipitation: dates.map((date) => byDate.get(date)?.precipitation ?? null),
    };
  },
};
