import { useTranslation } from "react-i18next";
import { Link, useLoaderData } from "react-router";
import type { Route } from "./+types/_index";
import { DemoButton, LanguageSwitcher, Logo } from "@/components/ui";
import { Waterfall } from "@/components/result/Waterfall";
import { getSession } from "@/lib/auth/server";
import { appContext } from "@/lib/util/app-context";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(appContext);
  // ログイン中でもトップは見られる。そのときは入口をアプリへのリンクにする
  return { signedIn: (await getSession(env, request)) !== null };
}

/**
 * 見本の内訳。架空のパン屋 (Portland、本物の NOAA の天気) のデータで、10/12〜18 を 10/5〜11 と比べて
 * 実際に計算した結果 (デモの店と同じ seed、scripts/try-demo.ts、2026-10-27)。広告は 10/11〜17 に止めてあり、仕込んだ効果は -129.4
 */
const SAMPLE = {
  before: 1104,
  after: 978,
  rows: [
    { key: "ads", value: -133.0, margin: 27.0 },
    { key: "payday", value: 27.3, margin: 9.5 },
    { key: "instagram", value: 5.3, margin: 0.8 },
    { key: "weather", value: 2.2, margin: 0.4 },
  ],
  unexplained: -27.8,
} as const;

export default function Landing() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { signedIn } = useLoaderData<typeof loader>();

  return (
    <div className="min-h-dvh bg-white font-sans text-black">
      <header className="relative z-30">
        <div className="ui-container flex h-16 items-center justify-between">
          <Logo className="text-lg" />
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <Link to={signedIn ? "/app" : "/login"} className="text-sm font-semibold text-black/50 transition-colors hover:text-accent">
              {signedIn ? t("common.openApp") : t("common.signIn")}
            </Link>
          </div>
        </div>
      </header>

      <section className="relative">
        <div aria-hidden className="hero-glow pointer-events-none absolute inset-x-0 -top-16 bottom-0" />
        <div className="ui-container relative grid items-center gap-14 pt-16 pb-24 lg:grid-cols-[1fr_1.1fr] lg:pt-24">
        <div>
          <h1 className="h-display text-4xl font-semibold sm:text-6xl">{t("landing.headline")}</h1>
          <p className="mt-8 max-w-xl text-base leading-relaxed text-black/50 sm:text-lg">{t("landing.lead")}</p>
          <div className="mt-10 max-w-sm">
            {signedIn ? (
              <Link to="/app" className="button-primary w-full">
                {t("common.openApp")}
              </Link>
            ) : (
              <DemoButton />
            )}
          </div>
        </div>

        <figure className="rounded-2xl border border-accent/25 bg-white p-5 shadow-2xl shadow-accent/20">
          <p className="ml-auto w-fit rounded-3xl bg-accent px-4 py-2 text-sm text-on-accent">{t("landing.sample.question")}</p>
          <div className="mt-5">
            <Waterfall
              before={SAMPLE.before}
              after={SAMPLE.after}
              unit="orders"
              locale={locale}
              labels={{ before: t("landing.sample.before"), after: t("landing.sample.after") }}
              rows={[
                ...SAMPLE.rows.map((r) => ({ ...r, label: t(`landing.sample.${r.key}`), kind: "cause" as const })),
                { key: "unexplained", label: t("result.unexplained"), value: SAMPLE.unexplained, kind: "unexplained" as const },
              ]}
            />
          </div>
          <figcaption className="mt-4 text-xs leading-5 text-black/50">{t("landing.sample.caption")}</figcaption>
        </figure>
        </div>
      </section>

      <section className="border-t border-black/10">
        <div className="ui-container grid gap-10 py-20 md:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <div key={n}>
              <h2 className="text-lg font-semibold">{t(`landing.step${n}Title`)}</h2>
              <p className="mt-3 text-sm leading-relaxed text-black/50">{t(`landing.step${n}Body`)}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-black/10">
        <div className="ui-container flex flex-col gap-1 py-8 text-xs text-black/50 sm:flex-row sm:justify-between">
          <span>{t("landing.hackathon")}</span>
          <span>{t("landing.weatherCredit")}</span>
        </div>
      </footer>
    </div>
  );
}
