/** 小さな行列の計算。行列は行の配列 (number[][]) で持つ */

export type Matrix = number[][];

export function transpose(a: Matrix): Matrix {
  const rows = a.length;
  const cols = rows === 0 ? 0 : a[0].length;
  const t: Matrix = Array.from({ length: cols }, () => new Array<number>(rows));
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) t[j][i] = a[i][j];
  return t;
}

/** X^T X と X^T y (X は行の配列) */
export function normalEquations(x: Matrix, y: number[]) {
  const p = x[0]?.length ?? 0;
  const xtx: Matrix = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const xty = new Array<number>(p).fill(0);
  for (let i = 0; i < x.length; i++) {
    const row = x[i];
    for (let a = 0; a < p; a++) {
      const va = row[a];
      if (va === 0) continue;
      xty[a] += va * y[i];
      for (let b = a; b < p; b++) xtx[a][b] += va * row[b];
    }
  }
  for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) xtx[a][b] = xtx[b][a];
  return { xtx, xty };
}

/**
 * 対称な半正定値の行列の逆行列を、ピボットつきのガウス・ジョルダン法で求める。
 * 一次従属な列 (ピボットが最初の対角の大きさに比べて数値誤差の範囲まで小さい) は「使えない」として返す
 */
export function invertSymmetric(a: Matrix): { inverse: Matrix; dependent: boolean[] } {
  const n = a.length;
  const m = a.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  const scale = Math.max(...a.map((row, i) => Math.abs(row[i])), 0);
  // 倍精度の丸め誤差の目安 (列の数 × 対角の最大 × 機械イプシロン)
  const tolerance = n * scale * Number.EPSILON * 16;
  const dependent = new Array<boolean>(n).fill(false);
  const used = new Array<boolean>(n).fill(false);

  for (let step = 0; step < n; step++) {
    let pivot = -1;
    let best = tolerance;
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      const value = Math.abs(m[i][i]);
      if (value > best) {
        best = value;
        pivot = i;
      }
    }
    if (pivot < 0) break;
    used[pivot] = true;
    const d = m[pivot][pivot];
    for (let j = 0; j < 2 * n; j++) m[pivot][j] /= d;
    for (let i = 0; i < n; i++) {
      if (i === pivot) continue;
      const f = m[i][pivot];
      if (f === 0) continue;
      for (let j = 0; j < 2 * n; j++) m[i][j] -= f * m[pivot][j];
    }
  }

  const inverse: Matrix = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let i = 0; i < n; i++) {
    if (!used[i]) {
      dependent[i] = true;
      continue;
    }
    for (let j = 0; j < n; j++) if (used[j]) inverse[i][j] = m[i][n + j];
  }
  return { inverse, dependent };
}

export function matVec(a: Matrix, v: number[]): number[] {
  return a.map((row) => row.reduce((sum, value, j) => sum + value * v[j], 0));
}

export function dot(a: number[], b: number[]) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

export function mean(values: number[]) {
  return values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;
}
