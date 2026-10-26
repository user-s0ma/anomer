import type { z } from "zod";
import type { Aggregation } from "../analysis/investigate";

/**
 * データ源 (プラグイン) の決まり。本体はデータ源のことを知らず、ここに書いた説明と、
 * プラグインが返す日別の値だけを使う
 */

export type Label = { en: string; ja: string };

export type MetricDefinition = {
  /** 数字の名前。すべてのプラグインを通して一意 */
  key: string;
  label: Label;
  /** AI が読む説明 (英語) */
  description: string;
  unit: string;
  aggregation: Aggregation;
  /** 値が届くまでの日数。直近のこの日数は、まだ値がない */
  latencyDays: number;
};

/** どのデータ源のものかがわかる数字の説明 */
export type SourcedMetric = MetricDefinition & { source: string };

/**
 * つなぐときに入れてもらう設定の項目。画面はこれを読んで入力の欄を作る。
 * city = 店の都市を選ぶ、date = 日付、seed = 入れてもらわずに乱数で決める (シミュレーター用)
 */
export type SettingField = { key: string; type: "city" | "date" | "seed"; label: Label };

/** 画面とサーバーの両方で読む、データ源の説明 */
export type SourceDefinition = {
  id: string;
  label: Label;
  /** 本物のデータか、形だけ本物に合わせたシミュレーターか */
  kind: "live" | "simulated";
  /** 形を合わせた API */
  modeledOn: string;
  metrics: MetricDefinition[];
  settings: SettingField[];
  /** 値を作るのに要る、ほかのデータ源の id (先につないでおく) */
  dependsOn: string[];
};

export type DailyValues = Record<string, (number | null)[]>;

/** 値を取る処理 (サーバーだけで使う) */
export type DataSourcePlugin<Config = unknown> = {
  definition: SourceDefinition;
  /** 店ごとの設定 (どこの天気か、シミュレーターの seed など)。DB の JSON を確かめるのに使う */
  config: z.ZodType<Config>;
  /**
   * dates (連続した日付、古い順) の日別の値を、definition.metrics のすべての数字について返す。
   * まだ届いていない日は null にする
   */
  fetch(input: { config: Config; dates: string[]; inputs: DailyValues }): Promise<DailyValues>;
};
