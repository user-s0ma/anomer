import { useTranslation } from "react-i18next";
import { Link, redirect } from "react-router";
import { CloudRain, MessageSquareText, Sigma } from "lucide-react";
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

const STEPS = [
  { n: 1, icon: MessageSquareText },
  { n: 2, icon: Sigma },
  { n: 3, icon: CloudRain },
];

export default function Landing() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const ja = locale === "ja";

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

      <section className="relative overflow-hidden">
        <div className="ui-container grid items-center gap-14 pt-16 pb-24 lg:grid-cols-[1.05fr_1fr] lg:pt-24">
          <div>
            <h1 className="h-display text-4xl font-semibold sm:text-6xl">{t("landing.headline")}</h1>
            <p className="mt-8 max-w-xl text-base leading-relaxed text-black/50 sm:text-lg">{t("landing.lead")}</p>
            <div className="mt-10 max-w-sm">
              <DemoButton />
              <p className="mt-3 text-xs leading-5 text-black/50">{t("common.tryDemoNote")}</p>
            </div>
          </div>

          <figure className="rounded-2xl border border-black/10 bg-white p-5 shadow-[0_40px_80px_-32px_rgba(0,0,0,0.35)]">
            <p className="ml-auto w-fit rounded-3xl bg-black/10 px-4 py-2 text-sm">{t("landing.headline")}</p>
            <p className="num mt-5 text-2xl font-semibold tracking-tight">
              <span className="text-black/50">1,053 → </span>911 <span className="text-lg text-down">−142</span>
            </p>
            <div className="mt-4">
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
            </div>
            <figcaption className="mt-3 text-[11px] text-black/50">{t("landing.sampleTitle")}</figcaption>
          </figure>
        </div>
      </section>

      <section className="border-t border-black/10">
        <div className="ui-container py-24">
          <h2 className="h-display text-3xl font-semibold sm:text-5xl">{t("landing.stepsTitle")}</h2>
          <ol className="mt-14 grid gap-10 md:grid-cols-3">
            {STEPS.map(({ n, icon: Icon }) => (
              <li key={n} className="border-t border-black/10 pt-6">
                <Icon className="size-5" />
                <h3 className="mt-5 text-lg font-semibold">{t(`landing.step${n}Title`)}</h3>
                <p className="mt-3 text-sm leading-relaxed text-black/50">{t(`landing.step${n}Body`)}</p>
              </li>
            ))}
          </ol>
          <p className="mt-14 text-sm text-black/50">{t("landing.simulatedNote")}</p>
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
