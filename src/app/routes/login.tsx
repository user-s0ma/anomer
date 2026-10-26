import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, redirect, useNavigate } from "react-router";
import { Turnstile } from "@marsidev/react-turnstile";
import type { Route } from "./+types/login";
import { DemoButton, Logo, buttonPrimary, inputClass } from "@/components/ui";
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
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <Link to="/" className="mb-8 self-start">
        <Logo className="text-lg" />
      </Link>
      <h1 className="text-2xl font-bold">{mode === "signIn" ? t("login.title") : t("login.createTitle")}</h1>
      <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
        {mode === "signUp" && (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t("login.name")}
            <input name="name" required maxLength={80} autoComplete="name" className={inputClass} />
          </label>
        )}
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t("login.email")}
          <input name="email" type="email" required autoComplete="email" className={inputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {t("login.password")}
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "signIn" ? "current-password" : "new-password"}
            className={inputClass}
          />
        </label>
        {siteKey && <Turnstile siteKey={siteKey} onSuccess={setToken} onExpire={() => setToken(null)} options={{ size: "flexible" }} />}
        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="submit" className={buttonPrimary} disabled={busy}>
          {busy ? t("common.loading") : mode === "signIn" ? t("login.submit") : t("login.create")}
        </button>
      </form>
      <button
        type="button"
        onClick={() => {
          setMode(mode === "signIn" ? "signUp" : "signIn");
          setError(null);
        }}
        className="mt-4 self-start text-sm font-medium text-accent hover:underline"
      >
        {mode === "signIn" ? t("login.toCreate") : t("login.toSignIn")}
      </button>
      <div className="mt-10 border-t border-line pt-6">
        <DemoButton />
      </div>
    </div>
  );
}
