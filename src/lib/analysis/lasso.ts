/**
 * L1 正則化つきの線形回帰 (Lasso) を座標降下法で当てる。
 * 目的関数は glmnet と同じ (1/2n)||y - Xb||^2 + λ||b||_1 で、列は平均0・分散1にそろえてから当てる。
 * λ の並び・収束の判定・反復の上限も glmnet の既定に合わせる (Friedman, Hastie, Tibshirani 2010)
 */

/** glmnet の既定: λ の数 */
const LAMBDA_COUNT = 100;
/** glmnet の既定: 収束の判定 (帰無の逸脱度に対する比) */
const CONVERGENCE_THRESHOLD = 1e-7;
/** glmnet の既定: 全体の反復の上限 */
const MAX_PASSES = 100_000;

/** 列ごとに平均0・分散1にそろえたデータ。分散が0の列は使わない */
type Standardized = {
  /** 列ごとの値 (列優先) */
  columns: Float64Array[];
  means: number[];
  scales: number[];
  usable: boolean[];
  yMean: number;
  y: Float64Array;
  n: number;
};

function standardize(x: number[][], y: number[], rows: number[]): Standardized {
  const n = rows.length;
  const p = x[0]?.length ?? 0;
  const columns: Float64Array[] = [];
  const means: number[] = [];
  const scales: number[] = [];
  const usable: boolean[] = [];
  for (let j = 0; j < p; j++) {
    let sum = 0;
    for (const r of rows) sum += x[r][j];
    const m = sum / n;
    let ss = 0;
    for (const r of rows) ss += (x[r][j] - m) ** 2;
    const sd = Math.sqrt(ss / n);
    const column = new Float64Array(n);
    // 分散が浮動小数の誤差の範囲なら定数の列とみなす
    const ok = sd > Math.abs(m) * 1e-12 && sd > 0;
    if (ok) for (let i = 0; i < n; i++) column[i] = (x[rows[i]][j] - m) / sd;
    columns.push(column);
    means.push(m);
    scales.push(ok ? sd : 1);
    usable.push(ok);
  }
  let ySum = 0;
  for (const r of rows) ySum += y[r];
  const yMean = ySum / n;
  const yc = new Float64Array(n);
  for (let i = 0; i < n; i++) yc[i] = y[rows[i]] - yMean;
  return { columns, means, scales, usable, yMean, y: yc, n };
}

/** λ の並び: 全部の係数が0になる最小の λ から、その (n > p なら 1e-4、でなければ 1e-2) 倍まで対数で等間隔 */
function lambdaPath(data: Standardized): number[] {
  const p = data.columns.length;
  let max = 0;
  for (let j = 0; j < p; j++) {
    if (!data.usable[j]) continue;
    let s = 0;
    const c = data.columns[j];
    for (let i = 0; i < data.n; i++) s += c[i] * data.y[i];
    max = Math.max(max, Math.abs(s) / data.n);
  }
  if (max === 0) return [0];
  const ratio = data.n > p ? 1e-4 : 1e-2;
  return Array.from({ length: LAMBDA_COUNT }, (_, k) => max * ratio ** (k / (LAMBDA_COUNT - 1)));
}

/** λ の並びに沿って、前の解から始めて解いていく。返すのは標準化した列での係数 */
function fitPath(data: Standardized, lambdas: number[]): Float64Array[] {
  const p = data.columns.length;
  const n = data.n;
  const beta = new Float64Array(p);
  const residual = Float64Array.from(data.y);
  let nullDeviance = 0;
  for (let i = 0; i < n; i++) nullDeviance += data.y[i] ** 2;
  const threshold = (CONVERGENCE_THRESHOLD * nullDeviance) / n;
  const path: Float64Array[] = [];
  let passes = 0;

  for (const lambda of lambdas) {
    while (passes < MAX_PASSES) {
      passes++;
      let maxChange = 0;
      for (let j = 0; j < p; j++) {
        if (!data.usable[j]) continue;
        const c = data.columns[j];
        let rho = 0;
        for (let i = 0; i < n; i++) rho += c[i] * residual[i];
        rho = rho / n + beta[j];
        const next = Math.sign(rho) * Math.max(Math.abs(rho) - lambda, 0);
        const delta = next - beta[j];
        if (delta !== 0) {
          for (let i = 0; i < n; i++) residual[i] -= delta * c[i];
          beta[j] = next;
          maxChange = Math.max(maxChange, delta * delta);
        }
      }
      if (maxChange < threshold) break;
    }
    path.push(Float64Array.from(beta));
  }
  return path;
}

function predict(data: Standardized, beta: Float64Array, row: number[]) {
  let value = data.yMean;
  for (let j = 0; j < beta.length; j++) {
    if (beta[j] === 0) continue;
    value += (beta[j] * (row[j] - data.means[j])) / data.scales[j];
  }
  return value;
}

export type LassoResult = {
  /** 選ばれた λ (標準化した列での値) */
  lambda: number;
  /** 係数が0でない列の番号 */
  selected: number[];
  /** 時間順の交差検証の、λ ごとの平均二乗誤差 */
  cvError: number[];
  lambdas: number[];
  folds: number;
};

/**
 * 時間順の交差検証で λ を選び、全部の行で当て直して残った列を返す。
 * 行を時間順に (folds + 1) 個に分け、k 番目の検証では、それより前のすべてで当てて k 番目を予測する。
 * λ は誤差が最小の λ から標準誤差1つ分の範囲で、いちばん大きいもの (1標準誤差のルール) を選ぶ
 */
export function fitLasso(x: number[][], y: number[], folds: number): LassoResult {
  const n = y.length;
  const allRows = Array.from({ length: n }, (_, i) => i);
  const full = standardize(x, y, allRows);
  const lambdas = lambdaPath(full);

  const blockSize = Math.floor(n / (folds + 1));
  if (blockSize < 1) throw new Error(`行が少なすぎます (${n} 行で ${folds} 回の検証はできない)`);
  const errors: number[][] = lambdas.map(() => []);
  for (let k = 1; k <= folds; k++) {
    const trainEnd = k * blockSize;
    const testEnd = k === folds ? n : (k + 1) * blockSize;
    const train = standardize(x, y, allRows.slice(0, trainEnd));
    const path = fitPath(train, lambdas);
    path.forEach((beta, l) => {
      let se = 0;
      for (let r = trainEnd; r < testEnd; r++) se += (y[r] - predict(train, beta, x[r])) ** 2;
      errors[l].push(se / (testEnd - trainEnd));
    });
  }
  const cvError = errors.map((e) => e.reduce((s, v) => s + v, 0) / e.length);
  const cvStdErr = errors.map((e, l) => {
    const m = cvError[l];
    const variance = e.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(e.length - 1, 1);
    return Math.sqrt(variance / e.length);
  });
  let best = 0;
  for (let l = 1; l < lambdas.length; l++) if (cvError[l] < cvError[best]) best = l;
  const limit = cvError[best] + cvStdErr[best];
  let chosen = best;
  for (let l = 0; l < best; l++) {
    if (cvError[l] <= limit) {
      chosen = l;
      break;
    }
  }

  const path = fitPath(full, lambdas.slice(0, chosen + 1));
  const beta = path[path.length - 1];
  const selected: number[] = [];
  beta.forEach((b, j) => {
    if (b !== 0) selected.push(j);
  });
  return { lambda: lambdas[chosen], selected, cvError, lambdas, folds };
}
