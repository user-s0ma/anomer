/**
 * サーバーが読む設定。公開してよい値は wrangler.jsonc の vars、秘密の値は Workers のシークレット
 * (手元は .dev.vars)。項目の説明は .dev.vars.example
 */
interface AppEnv {
  VITE_PUBLIC_APP_URL: string;
  /** 店・データ・調査・ログインの記録 (Cloudflare D1) */
  DB: D1Database;
  /** Meta Model API の入口と、使うモデル */
  META_MODEL_API_BASE: string;
  META_MODEL: string;
  DAILY_INVESTIGATIONS_TOTAL: string;
  DAILY_INVESTIGATIONS_PER_DEMO_VISITOR: string;
  DAILY_INVESTIGATIONS_PER_USER: string;

  BETTER_AUTH_SECRET: string;
  TURNSTILE_SECRET_KEY: string;
  META_MODEL_API_KEY: string;
}
