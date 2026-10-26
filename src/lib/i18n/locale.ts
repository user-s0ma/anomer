export const LOCALES = ["en", "ja"] as const;
export const DEFAULT_LOCALE: Locale = "en";
export const LOCALE_COOKIE = "anomer_locale";

export function isLocale(value: unknown): value is Locale {
  return LOCALES.includes(value as Locale);
}

/** 言語は、画面で選んだもの (クッキー)、なければブラウザの言語で決める */
export function localeFromRequest(request: Request): Locale {
  const cookie = request.headers.get("cookie") ?? "";
  const chosen = cookie
    .split(";")
    .map((part) => part.trim().split("="))
    .find(([name]) => name === LOCALE_COOKIE)?.[1];
  if (isLocale(chosen)) return chosen;
  const accepted = request.headers.get("accept-language") ?? "";
  return accepted.toLowerCase().startsWith("ja") ? "ja" : DEFAULT_LOCALE;
}
