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
 * city = 店の都市を選ぶ、date = 日付、file = CSV を上げる、seed = 入れてもらわずに乱数で決める (デモのデータ用)
 */
export type SettingField = { key: string; type: "city" | "date" | "file" | "seed"; label: Label };

/** 画面とサーバーの両方で読む、データ源の説明 */
export type SourceDefinition = {
  id: string;
  label: Label;
  /** 連携の一覧に出す短い説明 */
  description: Label;
  /** 一覧に出すアイコンの名前 (画面の SourceIcon が絵に変える) */
  icon: "orders" | "ads" | "social" | "weather";
  /** API から読むか、CSV を上げてもらうか */
  via: "api" | "csv";
  /** 読む API、または CSV の形 */
  format: string;
  metrics: MetricDefinition[];
  settings: SettingField[];
  /** 値を作るのに要る、ほかのデータ源の id (先につないでおく) */
  dependsOn: string[];
};

export type DailyValues = Record<string, (number | null)[]>;

/** CSV を上げるデータ源の、上げた CSV を日別にまとめたもの */
export type Upload = { firstDate: string; values: Record<string, number[]> };

/** 値を取る処理 (サーバーだけで使う) */
export type DataSourcePlugin<Config = unknown> = {
  definition: SourceDefinition;
  /** 店ごとの設定 (どこの天気か、どのアカウントか、デモのデータか)。DB の JSON を確かめるのに使う */
  config: z.ZodType<Config>;
  /** 画面で入れてもらった設定 (settings の項目) から、保存する設定を作る */
  fromSettings(settings: Record<string, unknown>): Config;
  /** デモのデータを読んでいるか (画面に出す) */
  isDemo(config: Config): boolean;
  /**
   * ファイル (settings の file の項目) を上げるデータ源は、ここでファイルを読んで日別にまとめる。
   * 返した upload は保存され、fetch に渡る。settings は fromSettings に渡る
   */
  ingest?(file: { name: string; text: string; demo: boolean }, timezone: string): { upload: Upload; settings: Record<string, unknown> };
  /**
   * dates (連続した日付、古い順) の日別の値を、definition.metrics のすべての数字について返す。
   * まだ届いていない日は null にする
   */
  fetch(input: { config: Config; dates: string[]; timezone: string; inputs: DailyValues; upload: Upload | null }): Promise<DailyValues>;
};
