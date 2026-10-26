import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLoaderData } from "react-router";
import { ArrowRight } from "lucide-react";
import type { Route } from "./+types/_index";
import { SOURCE_ICONS } from "@/components/source-icons";
import { DemoButton, Logo } from "@/components/ui";
import { Waterfall } from "@/components/result/Waterfall";
import { getSession } from "@/lib/auth/server";
import { SOURCES } from "@/lib/sources/definitions";
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
  planted: -129.4,
  rows: [
    { key: "ads", value: -133.0, margin: 27.0 },
    { key: "payday", value: 27.3, margin: 9.5 },
    { key: "instagram", value: 5.3, margin: 0.8 },
    { key: "weather", value: 2.2, margin: 0.4 },
  ],
  unexplained: -27.8,
} as const;

const STEPS = ["read", "fit", "explain"] as const;
const PRINCIPLES = ["numbers", "range", "unexplained"] as const;
const FAQ = ["data", "history", "demo", "privacy"] as const;

function SectionTitle({ title, lead }: { title: string; lead?: ReactNode }) {
  return (
    <div>
      <h2 className="h-display text-3xl font-semibold sm:text-4xl">{title}</h2>
      {lead && <p className="mt-4 max-w-md text-base leading-7 text-black/50">{lead}</p>}
    </div>
  );
}

/** 入口。ログイン中はアプリへ、そうでなければデモアカウントへ */
function Entry({ signedIn }: { signedIn: boolean }) {
  const { t } = useTranslation();
  if (!signedIn) return <DemoButton />;
  return (
    <Link to="/app" className="button-large w-full bg-accent text-on-accent hover:bg-accent/85">
      {t("common.openApp")}
      <ArrowRight className="size-4" />
    </Link>
  );
}

export default function Landing() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language as Locale;
  const { signedIn } = useLoaderData<typeof loader>();
  const ads = SAMPLE.rows[0];

  return (
    <div className="min-h-dvh overflow-x-clip bg-white font-sans text-black">
      <header className="relative z-30">
        <div className="ui-container flex h-16 items-center justify-between">
          <Logo className="text-lg" />
          <div className="flex items-center gap-4">
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
              <Entry signedIn={signedIn} />
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

      {/* 仕込んだ効果と、Anomer が出した値 */}
      <section className="border-t border-black/10">
        <div className="ui-container grid gap-10 py-14 lg:grid-cols-2 lg:items-center">
          <dl className="flex flex-wrap items-start gap-x-6 gap-y-4">
            <div>
              <dd className="num text-4xl font-semibold tracking-tight text-black/50">{SAMPLE.planted.toFixed(1)}</dd>
              <dt className="mt-1 text-xs text-black/50">{t("landing.check.planted")}</dt>
            </div>
            <ArrowRight aria-hidden className="mt-2.5 size-6 shrink-0 text-black/30" />
            <div>
              <dd className="num text-4xl font-semibold tracking-tight text-accent">
                {ads.value.toFixed(1)}
                <span className="ml-1.5 text-xl text-black/50">± {ads.margin.toFixed(0)}</span>
              </dd>
              <dt className="mt-1 text-xs text-black/50">{t("landing.check.found")}</dt>
            </div>
          </dl>
          <p className="max-w-lg text-base leading-7 text-black/70">{t("landing.check.body")}</p>
        </div>
      </section>

      {/* 質問から答えまで */}
      <section className="border-t border-black/10">
        <div className="ui-container py-20 lg:py-24">
          <SectionTitle title={t("landing.steps.title")} />
          <ol className="mt-12 grid gap-10 lg:grid-cols-3 lg:gap-8">
            {STEPS.map((key, index) => (
              <li key={key} className="relative pl-14 lg:pt-14 lg:pl-0">
                {index < STEPS.length - 1 && (
                  <span
                    aria-hidden
                    className="absolute top-11 -bottom-10 left-[19px] w-0.5 bg-accent/30 lg:top-[19px] lg:right-[-2rem] lg:bottom-auto lg:left-11 lg:h-0.5 lg:w-auto"
                  />
                )}
                <span className="num absolute top-0 left-0 flex size-10 items-center justify-center rounded-full bg-accent text-sm font-semibold text-on-accent">
                  {index + 1}
                </span>
                <h3 className="text-lg font-semibold">{t(`landing.steps.${key}.title`)}</h3>
                <p className="mt-2 text-sm leading-6 text-black/50">{t(`landing.steps.${key}.body`)}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* つなぐデータ。中身はデータ源の定義から出す */}
      <section className="border-t border-black/10">
        <div className="ui-container grid gap-10 py-20 lg:grid-cols-12 lg:gap-12 lg:py-24">
          <div className="lg:col-span-4">
            <SectionTitle title={t("landing.sources.title")} lead={t("landing.sources.lead")} />
          </div>
          <ul className="grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:col-span-8">
            {SOURCES.map((source) => {
              const Icon = SOURCE_ICONS[source.icon];
              return (
                <li key={source.id} className="flex gap-4">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-semibold">{source.label[locale]}</h3>
                    <p className="mt-0.5 font-mono text-xs text-black/50">{source.format}</p>
                    <p className="mt-2 text-sm leading-6 text-black/70">{source.metrics.map((m) => m.label[locale]).join(", ")}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* 数字はコードが出す */}
      <section className="border-t border-black/10">
        <div className="ui-container py-20 lg:py-24">
          <SectionTitle title={t("landing.principles.title")} />
          <div className="mt-12 grid gap-10 md:grid-cols-3">
            {PRINCIPLES.map((key) => (
              <div key={key} className="rounded-2xl bg-accent/5 p-6">
                <h3 className="text-lg font-semibold">{t(`landing.principles.${key}.title`)}</h3>
                <p className="mt-2 text-sm leading-6 text-black/50">{t(`landing.principles.${key}.body`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* よくある質問 */}
      <section className="border-t border-black/10">
        <div className="ui-container grid gap-10 py-20 lg:grid-cols-12 lg:gap-12 lg:py-24">
          <div className="lg:col-span-4">
            <SectionTitle title={t("landing.faq.title")} />
          </div>
          <dl className="divide-y divide-black/10 border-y border-black/10 lg:col-span-8">
            {FAQ.map((key) => (
              <div key={key} className="py-5">
                <dt className="font-semibold">{t(`landing.faq.${key}.q`)}</dt>
                <dd className="mt-2 text-sm leading-6 text-black/50">{t(`landing.faq.${key}.a`)}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="relative border-t border-black/10">
        <div aria-hidden className="hero-glow pointer-events-none absolute inset-0" />
        <div className="ui-container relative flex flex-col items-start justify-between gap-8 py-20 lg:flex-row lg:items-center">
          <p className="h-display text-3xl font-semibold sm:text-4xl">{t("landing.final")}</p>
          <div className="w-full max-w-sm shrink-0">
            <Entry signedIn={signedIn} />
          </div>
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
