declare module "@fontsource-variable/*";

/** 画面と AI の答えは英語だけ (本人、2026-10-27) */
type Locale = "en";

interface ImportMetaEnv {
  readonly VITE_PUBLIC_APP_URL?: string;
  readonly VITE_PUBLIC_TURNSTILE_SITE_KEY?: string;
}
