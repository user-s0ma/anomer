import { dateIn } from "../util/dates";

/**
 * 注文の CSV を読み、店のタイムゾーンでの日別の数字にする。
 * 列: order_id, created_at (ISO 8601。時差の書いていないものは UTC とみなさず、受け付けない), customer_id, total
 * 新規の客は、その CSV の中で初めて注文した日に数える
 */

export const ORDER_CSV_COLUMNS = ["order_id", "created_at", "customer_id", "total"] as const;

export class OrderCsvError extends Error {}

/** CSV を行と列に分ける (引用符で囲んだ値の中のカンマと改行、"" による引用符を扱う) */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

const localDate = (at: number, timezone: string) => dateIn(timezone, new Date(at));

export type OrderDaily = {
  /** 最初と最後の注文の日 (店のタイムゾーン) */
  firstDate: string;
  lastDate: string;
  /** firstDate から lastDate まで、1日ずつの値 */
  values: Record<"orders" | "revenue" | "average_order_value" | "new_customers" | "returning_customers", number[]>;
  rows: number;
};

/** 注文の CSV を日別にまとめる */
export function aggregateOrderCsv(text: string, timezone: string): OrderDaily {
  const [header, ...rows] = parseCsv(text.replace(/^\uFEFF/, ""));
  if (!header) throw new OrderCsvError("The CSV is empty.");
  const column = Object.fromEntries(ORDER_CSV_COLUMNS.map((name) => [name, header.findIndex((h) => h.trim().toLowerCase() === name)]));
  const missing = ORDER_CSV_COLUMNS.filter((name) => column[name] < 0);
  if (missing.length > 0) throw new OrderCsvError(`Missing columns: ${missing.join(", ")}`);
  if (rows.length === 0) throw new OrderCsvError("The CSV has no orders.");

  const seenOrders = new Set<string>();
  const orders = rows.map((row, i) => {
    const line = i + 2;
    const id = row[column.order_id]?.trim();
    const createdAt = row[column.created_at]?.trim() ?? "";
    const customerId = row[column.customer_id]?.trim();
    const total = Number(row[column.total]);
    // 時差 (Z や +09:00) のない日時は、どこの時刻か決められないので受け付けない
    if (!/(Z|[+-]\d{2}:?\d{2})$/.test(createdAt) || Number.isNaN(Date.parse(createdAt))) {
      throw new OrderCsvError(`Line ${line}: created_at must be ISO 8601 with a time zone`);
    }
    if (!id || !customerId || !Number.isFinite(total)) throw new OrderCsvError(`Line ${line}: missing order_id, customer_id or total`);
    if (seenOrders.has(id)) throw new OrderCsvError(`Line ${line}: order_id ${id} appears twice`);
    seenOrders.add(id);
    return { at: Date.parse(createdAt), customerId, total };
  });
  orders.sort((a, b) => a.at - b.at);

  const firstDate = localDate(orders[0].at, timezone);
  const lastDate = localDate(orders[orders.length - 1].at, timezone);
  const days = Math.round((Date.parse(`${lastDate}T00:00:00Z`) - Date.parse(`${firstDate}T00:00:00Z`)) / 86_400_000) + 1;
  const zeros = () => new Array<number>(days).fill(0);
  const counts = zeros();
  const revenue = zeros();
  const newCustomers = zeros();
  const seenCustomers = new Set<string>();
  for (const order of orders) {
    const t = Math.round((Date.parse(`${localDate(order.at, timezone)}T00:00:00Z`) - Date.parse(`${firstDate}T00:00:00Z`)) / 86_400_000);
    counts[t]++;
    revenue[t] += order.total;
    if (!seenCustomers.has(order.customerId)) {
      seenCustomers.add(order.customerId);
      newCustomers[t]++;
    }
  }
  const round = (v: number) => Math.round(v * 100) / 100;
  return {
    firstDate,
    lastDate,
    rows: orders.length,
    values: {
      orders: counts,
      revenue: revenue.map(round),
      average_order_value: counts.map((n, t) => (n === 0 ? 0 : round(revenue[t] / n))),
      new_customers: newCustomers,
      returning_customers: counts.map((n, t) => n - newCustomers[t]),
    },
  };
}
