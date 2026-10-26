import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Turnstile } from "@marsidev/react-turnstile";
import { useNavigate } from "react-router";
import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { signInDemo } from "@/lib/api-client";
import { LOCALE_COOKIE } from "@/lib/i18n/locale";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}>
      <svg viewBox="0 0 20 16" className="h-4" aria-hidden>
        <rect x="0" y="9" width="4" height="7" rx="1" className="fill-black/50" />
        <rect x="5.5" y="5" width="4" height="11" rx="1" className="fill-black/50" />
        <rect x="11" y="0" width="4" height="7" rx="1" className="fill-black" />
        <rect x="16.5" y="3" width="3.5" height="13" rx="1" className="fill-black" />
      </svg>
      Anomer
    </span>
  );
}

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const change = (locale: Locale) => {
    document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    window.location.reload();
  };
  return (
    <label className={`inline-flex items-center text-sm text-black/50 ${className}`}>
      <span className="sr-only">{t("common.language")}</span>
      <select
        value={i18n.language}
        onChange={(e) => change(e.target.value as Locale)}
        className="cursor-pointer rounded-lg bg-transparent px-1 py-1 text-sm text-black/50 outline-none hover:text-black"
      >
        <option value="en">English</option>
        <option value="ja">日本語</option>
      </select>
    </label>
  );
}

/** 審査員向けのデモアカウントに入るボタン。Turnstile を通ってから共有アカウントに入る (手元でサイトキーが無いときは Turnstile なし) */
export function DemoButton({ size = "large" }: { size?: "large" | "small" }) {
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
    <div className="flex flex-col gap-2">
      <button
        type="button"
        className={size === "large" ? "button-large bg-black text-white hover:bg-black/80" : "button-primary"}
        onClick={start}
        disabled={(!!siteKey && !token) || busy}
      >
        {busy ? t("common.loading") : t("common.tryDemo")}
        <ArrowRight className="size-4" />
      </button>
      {siteKey && (
        <Turnstile
          siteKey={siteKey}
          onSuccess={setToken}
          onExpire={() => setToken(null)}
          options={{ size: "flexible", appearance: "interaction-only" }}
        />
      )}
    </div>
  );
}
