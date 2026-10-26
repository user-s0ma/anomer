declare module "@fontsource-variable/*";

type Locale = "en" | "ja";

interface ImportMetaEnv {
  readonly VITE_PUBLIC_APP_URL?: string;
  readonly VITE_PUBLIC_TURNSTILE_SITE_KEY?: string;
}
