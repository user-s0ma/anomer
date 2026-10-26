import { useTranslation } from "react-i18next";
import { Link, redirect } from "react-router";
import type { Route } from "./+types/_index";
import { DemoButton, LanguageSwitcher, Logo } from "@/components/ui";
import { Waterfall } from "@/components/result/Waterfall";
import { getSession } from "@/lib/auth/server";
import { appContext } from "@/lib/util/app-context";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(appContext);
  if (await getSession(env, request)) throw redirect("/app");
  return null;
}

export default function Landing() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const ja = locale === "ja";

  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-4 sm:px-6">
      <header className="flex items-center justify-between py-5">
        <Logo className="text-lg" />
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Link to="/login" className="text-sm font-semibold text-accent hover:underline">
            {t("common.signIn")}
          </Link>
        </div>
      </header>

      <main className="flex-1">
        <section className="grid items-center gap-10 py-10 lg:grid-cols-[1.1fr_1fr] lg:py-16">
          <div>
            <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">{t("landing.headline")}</h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-soft">{t("landing.lead")}</p>
            <div className="mt-8 max-w-sm">
              <DemoButton />
            </div>
          </div>

          <figure className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
            <figcaption className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-mute">{t("landing.sampleTitle")}</figcaption>
            <p className="mb-4 font-semibold">{t("landing.headline")}</p>
            <Waterfall
              before={1053}
              after={911}
              unit="orders"
              locale={locale}
              labels={{ before: t("result.from"), after: t("result.to") }}
              rows={[
                { key: "ads", label: ja ? "広告を止めた" : "Ads were paused", value: -132, margin: 40, kind: "cause" },
                { key: "rain", label: ja ? "雨の日が多かった" : "More rainy days", value: -21, margin: 6, kind: "cause" },
                { key: "payday", label: ja ? "給料日が入った" : "A payday fell in the week", value: 18, margin: 9, kind: "cause" },
                { key: "unexplained", label: t("result.unexplained"), value: -7, kind: "unexplained" },
              ]}
            />
          </figure>
        </section>

        <section className="border-t border-line py-12">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-mute">{t("landing.stepsTitle")}</h2>
          <ol className="mt-6 grid gap-6 md:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <li key={n} className="rounded-xl border border-line bg-surface p-5">
                <span className="num text-sm font-semibold text-accent">0{n}</span>
                <h3 className="mt-2 font-semibold">{t(`landing.step${n}Title`)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">{t(`landing.step${n}Body`)}</p>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-sm text-ink-mute">{t("landing.simulatedNote")}</p>
        </section>
      </main>

      <footer className="flex flex-col gap-1 border-t border-line py-6 text-xs text-ink-mute sm:flex-row sm:justify-between">
        <span>{t("landing.hackathon")}</span>
        <a href="https://open-meteo.com/" className="hover:underline" target="_blank" rel="noreferrer">
          {t("landing.weatherCredit")}
        </a>
      </footer>
    </div>
  );
}
