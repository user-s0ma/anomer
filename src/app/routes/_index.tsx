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

/**
 * 見本の内訳。架空のパン屋 (Portland、本物の NOAA の天気) のデータで、10/12〜18 を 10/5〜11 と比べて
 * 実際に計算した結果 (scripts/try-demo.ts、2026-10-27)。広告は 10/11〜17 に止めてあり、仕込んだ効果は約 -132
 */
const SAMPLE = {
  before: 1090,
  after: 972,
  rows: [
    { key: "ads", value: -128.8, margin: 60.8 },
    { key: "payday", value: 22.8, margin: 13.1 },
    { key: "instagram", value: 5.5, margin: 6.3 },
    { key: "weather", value: -0.6, margin: 9.2 },
  ],
  unexplained: -16.9,
} as const;

export default function Landing() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;

  return (
    <div className="min-h-dvh bg-white font-sans text-black">
      <header className="sticky top-0 z-30 bg-white/70 backdrop-blur">
        <div className="ui-container flex h-16 items-center justify-between">
          <Logo className="text-lg" />
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <Link to="/login" className="text-sm font-semibold text-black/50 transition-colors hover:text-black">
              {t("common.signIn")}
            </Link>
          </div>
        </div>
      </header>

      <section className="ui-container grid items-center gap-14 pt-16 pb-24 lg:grid-cols-[1fr_1.1fr] lg:pt-24">
        <div>
          <h1 className="h-display text-4xl font-semibold sm:text-6xl">{t("landing.headline")}</h1>
          <p className="mt-8 max-w-xl text-base leading-relaxed text-black/50 sm:text-lg">{t("landing.lead")}</p>
          <div className="mt-10 max-w-sm">
            <DemoButton />
          </div>
        </div>

        <figure className="rounded-2xl border border-black/10 bg-white p-5 shadow-[0_40px_80px_-32px_rgba(0,0,0,0.35)]">
          <p className="ml-auto w-fit rounded-3xl bg-black/10 px-4 py-2 text-sm">{t("landing.sample.question")}</p>
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
