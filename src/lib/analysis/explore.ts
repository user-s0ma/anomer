import { MAX_LAG_DAYS } from "./investigate";

/**
 * 変化の内訳ではない質問 (「周期はある？」「広告と注文は関係ある？」など) に答えるための計算。
 * AI はこの中から行う分析を選ぶだけで、数字はすべてここで出す
 */

export const ANALYSIS_TYPES = ["summary", "weekday", "cycles", "trend", "correlation", "extremes"] as const;
export type AnalysisType = (typeof ANALYSIS_TYPES)[number];

/** AI が選んだ分析。期間は summary と extremes だけが使い、空ならデータのある全期間 */
export type AnalysisRequest = { type: AnalysisType; metric: string; other: string | null; start: string | null; end: string | null };

/** 周期を探す、ずらす日数の上限 (月の周期まで見る) */
const MAX_CYCLE_DAYS = 35;
/** 一番多い日・少ない日として挙げる日数 */
const EXTREME_DAYS = 5;

type Point = { date: string; value: number };

export type AnalysisOutput =
  | { type: "summary"; start: string; end: string; days: number; total: number; mean: number; min: Point; max: Point }
  | { type: "weekday"; start: string; end: string; overall: number; means: number[] }
  | { type: "cycles"; start: string; end: string; threshold: number; autocorrelation: number[]; peaks: { days: number; r: number }[] }
  | { type: "trend"; start: string; end: string; perYear: number; mean: number; firstQuarterMean: number; lastQuarterMean: number }
  | { type: "correlation"; start: string; end: string; byLag: { lag: number; r: number; pairs: number }[]; threshold: number }
  | { type: "extremes"; start: string; end: string; highest: Point[]; lowest: Point[] };

export type AnalysisResult = { request: AnalysisRequest; output: AnalysisOutput };

/** 日付 (YYYY-MM-DD) の曜日。月曜を0とする */
export function weekdayIndex(date: string) {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

const average = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

function pearson(xs: number[], ys: number[]) {
  const mx = average(xs);
  const my = average(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx === 0 || syy === 0 ? 0 : sxy / Math.sqrt(sxx * syy);
}

/** 値のある日だけを、期間で切って取り出す */
function points(dates: string[], values: (number | null)[], start: string | null, end: string | null): Point[] {
  return dates.flatMap((date, i) => {
    const value = values[i];
    if (value === null || (start && date < start) || (end && date > end)) return [];
    return [{ date, value }];
  });
}

/** 最小二乗の直線 (x は日の番号) */
function lineFit(ys: number[]) {
  const xs = ys.map((_, i) => i);
  const mx = average(xs);
  const my = average(ys);
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < ys.length; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  return { slope, intercept: my - slope * mx };
}

export function runAnalysis(dates: string[], series: Map<string, (number | null)[]>, request: AnalysisRequest): AnalysisOutput {
  const values = series.get(request.metric);
  if (!values) throw new Error(`知らない数字です: ${request.metric}`);
  const ranged = request.type === "summary" || request.type === "extremes";
  const data = points(dates, values, ranged ? request.start : null, ranged ? request.end : null);
  if (data.length < 2) throw new Error(`${request.metric} に値のある日が足りません`);
  const span = { start: data[0].date, end: data[data.length - 1].date };
  const ys = data.map((p) => p.value);

  switch (request.type) {
    case "summary": {
      const sorted = [...data].sort((a, b) => a.value - b.value);
      const total = ys.reduce((s, y) => s + y, 0);
      return { type: "summary", ...span, days: data.length, total, mean: total / data.length, min: sorted[0], max: sorted[sorted.length - 1] };
    }
    case "weekday": {
      const buckets: number[][] = Array.from({ length: 7 }, () => []);
      for (const p of data) buckets[weekdayIndex(p.date)].push(p.value);
      return { type: "weekday", ...span, overall: average(ys), means: buckets.map((b) => (b.length > 0 ? average(b) : 0)) };
    }
    case "cycles": {
      // 長い傾きを除いてから、k 日前の自分との相関を見る。偶然の目安は ±2/√n
      const { slope, intercept } = lineFit(ys);
      const residuals = ys.map((y, i) => y - (intercept + slope * i));
      const autocorrelation = Array.from({ length: MAX_CYCLE_DAYS }, (_, k) => pearson(residuals.slice(k + 1), residuals.slice(0, -(k + 1))));
      const threshold = 2 / Math.sqrt(residuals.length);
      // 山 (前後より高く、目安を超える) を、強い順に3つまで
      const peaks = autocorrelation
        .map((r, i) => ({ days: i + 1, r }))
        .filter((p, i, all) => p.r > threshold && p.days >= 2 && p.r >= (all[i - 1]?.r ?? -1) && p.r >= (all[i + 1]?.r ?? -1))
        .sort((a, b) => b.r - a.r)
        .slice(0, 3);
      return { type: "cycles", ...span, threshold, autocorrelation, peaks };
    }
    case "trend": {
      const { slope } = lineFit(ys);
      const quarter = Math.max(1, Math.floor(ys.length / 4));
      return {
        type: "trend",
        ...span,
        perYear: slope * 365,
        mean: average(ys),
        firstQuarterMean: average(ys.slice(0, quarter)),
        lastQuarterMean: average(ys.slice(-quarter)),
      };
    }
    case "correlation": {
      const other = request.other ? series.get(request.other) : undefined;
      if (!other) throw new Error(`比べる数字がありません: ${request.other}`);
      // other を lag 日ずらしたもの (other が lag 日先に動く) と metric の相関
      const byLag = Array.from({ length: MAX_LAG_DAYS + 1 }, (_, lag) => {
        const xs: number[] = [];
        const zs: number[] = [];
        for (let t = lag; t < dates.length; t++) {
          const y = values[t];
          const x = other[t - lag];
          if (y !== null && x !== null) {
            zs.push(y);
            xs.push(x);
          }
        }
        return { lag, r: xs.length > 2 ? pearson(xs, zs) : 0, pairs: xs.length };
      });
      return { type: "correlation", ...span, byLag, threshold: 2 / Math.sqrt(data.length) };
    }
    case "extremes": {
      const sorted = [...data].sort((a, b) => b.value - a.value);
      return { type: "extremes", ...span, highest: sorted.slice(0, EXTREME_DAYS), lowest: sorted.slice(-EXTREME_DAYS).reverse() };
    }
  }
}
