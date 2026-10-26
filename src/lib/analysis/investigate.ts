import { fitLasso } from "./lasso";
import { invertSymmetric, matVec, mean, normalEquations, dot } from "./linalg";

/**
 * 指した変化の内訳を出す。
 * 1. 候補をすべて同じ「列」にする: 傾き、曜日 (7本)、月の中の日 (31本)、各数字を0〜7日ずらしたもの
 * 2. Lasso で効く列だけを残す (lasso.ts)
 * 3. 残った列で普通の最小二乗を当て直し、比べる期間との差を各列 (係数 × 値の差) に分ける
 */

/** 数字をずらす日数の上限 (0〜7日、本人の設計 2026-10-26) */
export const MAX_LAG_DAYS = 7;
/** 時間順の交差検証の回数 (scikit-learn の TimeSeriesSplit の既定) */
const CV_FOLDS = 5;
/** 内訳の幅: 正規分布の両側 95% */
const Z_95 = 1.959963984540054;

export type Aggregation = "sum" | "mean";

export type MetricSeries = {
  key: string;
  /** dates と同じ並びの日別の値。まだ届いていない日は null */
  values: (number | null)[];
};

export type InvestigationInput = {
  /** 連続した日付 (YYYY-MM-DD)、古い順 */
  dates: string[];
  target: MetricSeries & { aggregation: Aggregation };
  /** 原因の候補にする数字 (調べる対象と、そこから計算される数字は入れない) */
  candidates: MetricSeries[];
  change: { start: string; end: string };
  baseline: { start: string; end: string };
};

export type ColumnKind =
  | { type: "trend" }
  | { type: "dayOfWeek"; day: number }
  | { type: "dayOfMonth"; day: number }
  | { type: "metric"; key: string; lag: number };

export type GroupKey = "trend" | "dayOfWeek" | "dayOfMonth" | `metric:${string}`;

export type BreakdownGroup = {
  key: GroupKey;
  /** 変化への寄与 (調べる数字の単位。sum なら期間の合計の差、mean なら平均の差) */
  contribution: number;
  /** 寄与の 95% の幅 (± の大きさ) */
  margin: number;
  /** この組の中で残った列と係数 (元の単位) */
  columns: { column: ColumnKind; coefficient: number; changeValue: number; baselineValue: number }[];
};

export type InvestigationResult = {
  /** 調べる数字の、比べる期間と変化の期間の値 (sum なら合計、mean なら平均) */
  baselineValue: number;
  changeValue: number;
  change: number;
  groups: BreakdownGroup[];
  /** 列で説明できない分 */
  unexplained: number;
  fit: {
    rows: number;
    columns: number;
    selected: number;
    folds: number;
    lambda: number;
    rSquared: number;
    firstDate: string;
    lastDate: string;
  };
  /** 変化の期間に値が欠けていて使えなかった数字 */
  unavailable: string[];
  /** グラフ用: 当てはめた期間の実際の値と、モデルの値 */
  series: { date: string; actual: number; fitted: number }[];
};

function dayIndex(dates: string[], date: string) {
  const index = dates.indexOf(date);
  if (index < 0) throw new Error(`日付 ${date} がデータの範囲にありません`);
  return index;
}

function dayOfWeek(date: string) {
  // 0 = 月曜
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

function dayOfMonth(date: string) {
  return Number(date.slice(8, 10));
}

export function groupOf(column: ColumnKind): GroupKey {
  if (column.type === "metric") return `metric:${column.key}`;
  return column.type;
}

export function investigate(input: InvestigationInput): InvestigationResult {
  const { dates, target, candidates } = input;
  const changeStart = dayIndex(dates, input.change.start);
  const changeEnd = dayIndex(dates, input.change.end);
  const baselineStart = dayIndex(dates, input.baseline.start);
  const baselineEnd = dayIndex(dates, input.baseline.end);
  const length = changeEnd - changeStart + 1;
  if (length < 1 || baselineEnd - baselineStart + 1 !== length) {
    throw new Error("変化の期間と比べる期間は同じ日数にしてください");
  }
  if (baselineEnd >= changeStart) throw new Error("比べる期間は変化の期間より前にしてください");

  // 当てはめるのは、ずらした値がそろう日から変化の期間の終わりまで
  const fitStart = MAX_LAG_DAYS;
  const fitEnd = changeEnd;
  if (baselineStart < fitStart) throw new Error("比べる期間の前に、少なくとも7日分のデータが要ります");

  // 変化と比べる期間 (ずらした分を含む) に欠けがある数字は使えない
  const unavailable: string[] = [];
  const usable = candidates.filter((series) => {
    for (let t = baselineStart - MAX_LAG_DAYS; t <= changeEnd; t++) {
      if (series.values[t] === null || series.values[t] === undefined) {
        unavailable.push(series.key);
        return false;
      }
    }
    return true;
  });

  const kinds: ColumnKind[] = [{ type: "trend" }];
  for (let d = 0; d < 7; d++) kinds.push({ type: "dayOfWeek", day: d });
  for (let d = 1; d <= 31; d++) kinds.push({ type: "dayOfMonth", day: d });
  for (const series of usable) for (let lag = 0; lag <= MAX_LAG_DAYS; lag++) kinds.push({ type: "metric", key: series.key, lag });
  const seriesByKey = new Map(usable.map((s) => [s.key, s]));

  const valueAt = (kind: ColumnKind, t: number): number | null => {
    switch (kind.type) {
      case "trend":
        return t / 365;
      case "dayOfWeek":
        return dayOfWeek(dates[t]) === kind.day ? 1 : 0;
      case "dayOfMonth":
        return dayOfMonth(dates[t]) === kind.day ? 1 : 0;
      case "metric":
        return seriesByKey.get(kind.key)!.values[t - kind.lag] ?? null;
    }
  };

  // 行: 調べる数字とすべての列がそろう日だけ
  const rowDays: number[] = [];
  const x: number[][] = [];
  const y: number[] = [];
  for (let t = fitStart; t <= fitEnd; t++) {
    const yt = target.values[t];
    if (yt === null || yt === undefined) continue;
    const row = kinds.map((kind) => valueAt(kind, t));
    if (row.some((v) => v === null)) continue;
    rowDays.push(t);
    x.push(row as number[]);
    y.push(yt);
  }
  for (let t = baselineStart; t <= changeEnd; t++) {
    if ((t <= baselineEnd || t >= changeStart) && !rowDays.includes(t)) {
      throw new Error(`${dates[t]} の値が欠けているので、この期間は調べられません`);
    }
  }

  const lasso = fitLasso(x, y, CV_FOLDS);
  const selected = lasso.selected;

  // 残った列で最小二乗を当て直す (切片つき)
  const design = x.map((row) => [1, ...selected.map((j) => row[j])]);
  const { xtx, xty } = normalEquations(design, y);
  const { inverse, dependent } = invertSymmetric(xtx);
  const beta = matVec(inverse, xty);
  const fitted = design.map((row) => dot(row, beta));
  const residuals = y.map((v, i) => v - fitted[i]);
  const rss = residuals.reduce((s, r) => s + r * r, 0);
  const yMean = mean(y);
  const tss = y.reduce((s, v) => s + (v - yMean) ** 2, 0);
  const rank = dependent.filter((d) => !d).length;
  const sigma2 = rss / Math.max(y.length - rank, 1);

  const windowMean = (column: number, start: number, end: number) => {
    const values: number[] = [];
    for (let t = start; t <= end; t++) values.push(x[rowDays.indexOf(t)][column]);
    return mean(values);
  };
  // sum の数字は期間の合計の差、mean の数字は平均の差で表す
  const scale = target.aggregation === "sum" ? length : 1;

  const baselineY = mean(range(baselineStart, baselineEnd).map((t) => target.values[t] as number)) * scale;
  const changeY = mean(range(changeStart, changeEnd).map((t) => target.values[t] as number)) * scale;

  const groups = new Map<GroupKey, { delta: number[]; indices: number[]; columns: BreakdownGroup["columns"] }>();
  selected.forEach((j, s) => {
    const k = s + 1; // design の列 (0 は切片)
    if (dependent[k]) return;
    const kind = kinds[j];
    const changeValue = windowMean(j, changeStart, changeEnd);
    const baselineValue = windowMean(j, baselineStart, baselineEnd);
    const key = groupOf(kind);
    const group = groups.get(key) ?? { delta: [], indices: [], columns: [] };
    group.delta.push((changeValue - baselineValue) * scale);
    group.indices.push(k);
    group.columns.push({ column: kind, coefficient: beta[k], changeValue, baselineValue });
    groups.set(key, group);
  });

  const breakdown: BreakdownGroup[] = [...groups.entries()].map(([key, group]) => {
    const contribution = group.indices.reduce((s, k, i) => s + beta[k] * group.delta[i], 0);
    let variance = 0;
    group.indices.forEach((a, i) =>
      group.indices.forEach((b, j) => {
        variance += group.delta[i] * group.delta[j] * inverse[a][b] * sigma2;
      }),
    );
    return { key, contribution, margin: Z_95 * Math.sqrt(Math.max(variance, 0)), columns: group.columns };
  });
  breakdown.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

  const change = changeY - baselineY;
  const explained = breakdown.reduce((s, g) => s + g.contribution, 0);

  return {
    baselineValue: baselineY,
    changeValue: changeY,
    change,
    groups: breakdown,
    unexplained: change - explained,
    fit: {
      rows: y.length,
      columns: kinds.length,
      selected: selected.length,
      folds: lasso.folds,
      lambda: lasso.lambda,
      rSquared: tss === 0 ? 0 : 1 - rss / tss,
      firstDate: dates[rowDays[0]],
      lastDate: dates[rowDays[rowDays.length - 1]],
    },
    unavailable,
    series: rowDays.map((t, i) => ({ date: dates[t], actual: y[i], fitted: fitted[i] })),
  };
}

function range(start: number, end: number) {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}
