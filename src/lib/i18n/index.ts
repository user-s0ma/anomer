import i18next, { type i18n as I18n } from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./en";

export const resources = { en: { translation: en } } as const;

export function createI18n(locale: Locale): I18n {
  const instance = i18next.createInstance();
  void instance.use(initReactI18next).init({
    resources,
    lng: locale,
    fallbackLng: false,
    interpolation: { escapeValue: false },
    initAsync: false,
  });
  return instance;
}

const shared: Partial<Record<Locale, I18n>> = {};

/** React の外 (meta など) で使う */
export function translate(locale: Locale, key: string, values?: Record<string, unknown>) {
  shared[locale] ??= createI18n(locale);
  return shared[locale].t(key, values);
}
