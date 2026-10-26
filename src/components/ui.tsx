import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Turnstile } from "@marsidev/react-turnstile";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { signInDemo } from "@/lib/api-client";
import { LOCALE_COOKIE } from "@/lib/i18n/locale";

export const buttonPrimary =
  "inline-flex items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50";
export const buttonSecondary =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface px-4 py-2.5 text-sm font-semibold text-ink transition hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-50";
export const inputClass =
  "w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-sm text-ink placeholder:text-ink-mute focus:border-accent focus:outline-none";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <svg viewBox="0 0 24 24" className="size-6" aria-hidden>
        <rect x="2" y="13" width="4" height="9" rx="1" className="fill-ink-mute" />
        <rect x="8" y="8" width="4" height="14" rx="1" className="fill-ink-mute" />
        <rect x="14" y="3" width="4" height="10" rx="1" className="fill-down" />
        <rect x="14" y="14" width="4" height="8" rx="1" className="fill-accent" />
        <rect x="20" y="10" width="2" height="12" rx="1" className="fill-ink" />
      </svg>
      Anomer
    </span>
  );
}

export function LanguageSwitcher() {
  const { t, i18n } = useTranslation();
  const change = (locale: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    window.location.reload();
  };
  return (
    <label className="inline-flex items-center gap-1 text-sm text-ink-soft">
      <span className="sr-only">{t("common.language")}</span>
      <select
        value={i18n.language}
        onChange={(e) => change(e.target.value as Locale)}
        className="rounded-md border border-line bg-surface px-2 py-1 text-sm text-ink"
      >
        <option value="en">English</option>
        <option value="ja">日本語</option>
      </select>
    </label>
  );
}

/** 審査員向けのデモアカウントに入るボタン。Turnstile を通ってから共有アカウントに入る (手元でサイトキーが無いときは Turnstile なし) */
export function DemoButton({ className = "" }: { className?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const siteKey = import.meta.env.VITE_PUBLIC_TURNSTILE_SITE_KEY;

  const start = async () => {
    if (siteKey && !token) return;
    setBusy(true);
    try {
      await signInDemo(token);
      navigate("/app");
    } catch {
      toast.error(t("common.error"));
      setBusy(false);
    }
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <button type="button" className={buttonPrimary} onClick={start} disabled={(!!siteKey && !token) || busy}>
        {busy ? t("common.loading") : t("common.tryDemo")}
      </button>
      {siteKey && <Turnstile siteKey={siteKey} onSuccess={setToken} onExpire={() => setToken(null)} options={{ size: "flexible" }} />}
      <p className="text-xs text-ink-mute">{t("common.tryDemoNote")}</p>
    </div>
  );
}
