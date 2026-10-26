import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, redirect, useNavigate } from "react-router";
import { Turnstile } from "@marsidev/react-turnstile";
import type { Route } from "./+types/login";
import { DemoButton, Logo } from "@/components/ui";
import { authClient } from "@/lib/api-client";
import { getSession } from "@/lib/auth/server";
import { appContext } from "@/lib/util/app-context";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(appContext);
  if (await getSession(env, request)) throw redirect("/app");
  return null;
}

export default function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ownAccountOpen, setOwnAccountOpen] = useState(false);
  const siteKey = import.meta.env.VITE_PUBLIC_TURNSTILE_SITE_KEY;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (siteKey && !token) {
      setError(t("login.captcha"));
      return;
    }
    setBusy(true);
    setError(null);
    const fetchOptions = token ? { headers: { "x-captcha-response": token } } : undefined;
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    const response =
      mode === "signIn"
        ? await authClient.signIn.email({ email, password, fetchOptions })
        : await authClient.signUp.email({ email, password, name: String(form.get("name")), fetchOptions });
    setBusy(false);
    if (response.error) {
      setError(mode === "signIn" ? t("login.failed") : (response.error.message ?? t("login.createFailed")));
      return;
    }
    navigate("/app");
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-white px-4 py-10 font-sans text-black">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-10 inline-block">
          <Logo className="text-lg" />
        </Link>
        <h1 className="h-display mb-6 text-3xl font-semibold">{t("login.demoTitle")}</h1>
        <DemoButton />

        <details className="mt-10" open={ownAccountOpen} onToggle={(e) => setOwnAccountOpen(e.currentTarget.open)}>
          <summary className="cursor-pointer text-sm text-black/50 hover:text-black">{t("login.ownAccount")}</summary>
          <form onSubmit={submit} className="mt-4 space-y-3">
            {mode === "signUp" && (
              <label className="block">
                <span className="mb-1 block text-xs">{t("login.name")}</span>
                <input name="name" required maxLength={80} autoComplete="name" className="input" />
              </label>
            )}
            <label className="block">
              <span className="mb-1 block text-xs">{t("login.email")}</span>
              <input name="email" type="email" required autoComplete="email" className="input" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs">{t("login.password")}</span>
              <input
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete={mode === "signIn" ? "current-password" : "new-password"}
                className="input"
              />
            </label>
            {siteKey && <Turnstile siteKey={siteKey} onSuccess={setToken} onExpire={() => setToken(null)} options={{ size: "flexible" }} />}
            {error && <p className="text-sm text-down">{error}</p>}
            <button type="submit" className="button-secondary w-full" disabled={busy}>
              {busy ? t("common.loading") : mode === "signIn" ? t("login.submit") : t("login.create")}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode(mode === "signIn" ? "signUp" : "signIn");
                setError(null);
              }}
              className="block text-xs text-black/50 hover:text-black hover:underline"
            >
              {mode === "signIn" ? t("login.toCreate") : t("login.toSignIn")}
            </button>
          </form>
        </details>
      </div>
    </div>
  );
}
