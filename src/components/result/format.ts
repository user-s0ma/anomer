import type { TFunction } from "i18next";
import type { ColumnKind, GroupKey } from "@/lib/analysis/investigate";
import { METRIC_BY_KEY, SOURCES } from "@/lib/sources/definitions";

/** 数字を単位つきで表す。USD は $、% はそのまま、ほかは数だけ */
export function formatValue(value: number, unit: string, locale: Locale, options: { signed?: boolean } = {}) {
  const abs = Math.abs(value);
  const digits = abs >= 100 ? 0 : abs >= 10 ? 1 : 2;
  const number = new Intl.NumberFormat(locale, {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
    signDisplay: options.signed ? "exceptZero" : "auto",
    ...(unit === "USD" ? { style: "currency", currency: "USD", maximumFractionDigits: abs >= 100 ? 0 : 2 } : {}),
  }).format(value);
  if (unit === "%") return `${number}%`;
  if (unit === "°C") return `${number}°C`;
  return number;
}

export function formatDate(date: string, locale: Locale) {
  return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

export function formatPeriod(period: { start: string; end: string }, locale: Locale) {
  if (period.start === period.end) return formatDate(period.start, locale);
  return `${formatDate(period.start, locale)} – ${formatDate(period.end, locale)}`;
}

export function metricLabel(key: string, locale: Locale) {
  return METRIC_BY_KEY.get(key)?.label[locale] ?? key;
}

export function groupLabel(key: GroupKey, locale: Locale, t: TFunction) {
  if (key.startsWith("source:")) {
    const id = key.slice("source:".length);
    return SOURCES.find((s) => s.id === id)?.label[locale] ?? id;
  }
  return t(`result.groups.${key}`);
}

export function columnLabel(column: ColumnKind, locale: Locale, t: TFunction) {
  switch (column.type) {
    case "metric":
      return `${metricLabel(column.key, locale)} · ${column.lag === 0 ? t("result.lag_0") : t("result.lag", { count: column.lag })}`;
    case "dayOfMonth":
      return t("result.dayOfMonth", { day: column.day });
    case "dayOfWeek":
      return (t("result.weekdays", { returnObjects: true }) as string[])[column.day];
    case "trend":
      return t("result.trend");
  }
}
