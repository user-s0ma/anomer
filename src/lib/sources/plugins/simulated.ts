import { z } from "zod";
import { INSTAGRAM, META_ADS, ORDERS } from "../definitions";
import { simulateAds, simulateInstagram, simulateOrders } from "../simulator";
import type { DataSourcePlugin } from "../types";

/*
 * 形だけ本物の API に合わせたシミュレーターのデータ源。設定には seed と、仕込む原因の日付を持つ
 */

const date = z.iso.date();

export const metaAdsSimulator: DataSourcePlugin<{ seed: number; pausedFrom: string; pausedTo: string }> = {
  definition: META_ADS,
  config: z.object({ seed: z.number().int(), pausedFrom: date, pausedTo: date }),
  async fetch({ config, dates }) {
    return simulateAds(dates, config.seed, { start: config.pausedFrom, end: config.pausedTo });
  },
};

export const instagramSimulator: DataSourcePlugin<{ seed: number; viralReel: string }> = {
  definition: INSTAGRAM,
  config: z.object({ seed: z.number().int(), viralReel: date }),
  async fetch({ config, dates }) {
    return simulateInstagram(dates, config.seed, config.viralReel);
  },
};

/** 注文は、広告費・プロフィールへの訪問・本物の降水量で動く */
export const ordersSimulator: DataSourcePlugin<{ seed: number }> = {
  definition: ORDERS,
  config: z.object({ seed: z.number().int() }),
  async fetch({ config, dates, inputs }) {
    return simulateOrders(dates, config.seed, {
      adSpend: inputs.ad_spend,
      profileVisits: inputs.ig_profile_visits,
      precipitation: inputs.precipitation,
    });
  },
};
