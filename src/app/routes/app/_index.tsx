import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { InvestigationDetail } from "@/components/result/InvestigationDetail";
import { buttonPrimary, inputClass } from "@/components/ui";
import { ApiError, ask, listInvestigations, type InvestigationStep } from "@/lib/api-client";
import { useMe } from "./_layout";

const STEPS: InvestigationStep[] = ["data", "reading", "fitting", "explaining"];

export default function Ask() {
  const { t, i18n } = useTranslation();
  const me = useMe();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [question, setQuestion] = useState("");
  const [running, setRunning] = useState<{ question: string; step: InvestigationStep } | null>(null);
  const list = useQuery({ queryKey: ["investigations"], queryFn: listInvestigations });

  const items = list.data?.items ?? [];
  const selectedId = params.get("q") ?? items[0]?.id;
  const selected = items.find((i) => i.id === selectedId);

  const submit = async (text: string) => {
    const q = text.trim();
    if (q.length < 3 || running) return;
    setRunning({ question: q, step: "data" });
    try {
      const view = await ask(q, (step) => setRunning({ question: q, step }));
      setQuestion("");
      await queryClient.invalidateQueries({ queryKey: ["investigations"] });
      setParams({ q: view.id });
    } catch (error) {
      toast.error(error instanceof ApiError && error.status === 429 ? t("app.limit") : t("common.error"));
    } finally {
      setRunning(null);
    }
  };

  const dateFormat = new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
      <aside className="flex flex-col gap-5">
        {me.data?.user.demo && <p className="rounded-lg border border-line bg-surface p-3 text-xs leading-relaxed text-ink-soft">{t("app.demoNote")}</p>}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit(question);
          }}
          className="flex flex-col gap-2"
        >
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void submit(question);
              }
            }}
            rows={3}
            maxLength={500}
            placeholder={t("app.askPlaceholder")}
            className={`${inputClass} resize-none`}
          />
          <button type="submit" className={buttonPrimary} disabled={!!running || question.trim().length < 3}>
            {t("app.ask")}
          </button>
        </form>

        {(me.data?.suggestions.length ?? 0) > 0 && (
          <div>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-mute">{t("app.suggestions")}</h2>
            <ul className="flex flex-col gap-1.5">
              {me.data!.suggestions.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    disabled={!!running}
                    onClick={() => void submit(s)}
                    className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-left text-sm hover:border-accent disabled:opacity-50"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-mute">{t("app.history")}</h2>
          {items.length === 0 ? (
            <p className="text-sm text-ink-mute">{list.isPending ? t("common.loading") : t("app.noHistory")}</p>
          ) : (
            <ul className="flex flex-col">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setParams({ q: item.id })}
                    className={`w-full rounded-lg px-3 py-2 text-left text-sm ${item.id === selectedId ? "bg-sunken" : "hover:bg-sunken/60"}`}
                  >
                    <span className="line-clamp-2">{item.question}</span>
                    <span className="mt-0.5 block text-xs text-ink-mute">
                      {dateFormat.format(new Date(item.createdAt))}
                      {item.status === "failed" && ` · ${t("app.failed")}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      <section className="min-w-0">
        {running ? (
          <div className="rounded-xl border border-line bg-surface p-5">
            <h2 className="text-lg font-semibold">{running.question}</h2>
            <ol className="mt-4 flex flex-col gap-2.5">
              {STEPS.map((step, i) => {
                const current = STEPS.indexOf(running.step);
                const done = i < current;
                const active = i === current;
                return (
                  <li key={step} className={`flex items-center gap-2.5 text-sm ${done ? "text-ink-soft" : active ? "font-medium text-ink" : "text-ink-mute"}`}>
                    {done ? <Check className="size-4 text-up" /> : active ? <Loader2 className="size-4 animate-spin text-accent" /> : <span className="size-4" />}
                    {t(`app.steps.${step}`)}
                  </li>
                );
              })}
            </ol>
          </div>
        ) : selected ? (
          <InvestigationDetail investigation={selected} />
        ) : (
          <p className="rounded-xl border border-dashed border-line-strong p-8 text-center text-sm text-ink-mute">{t("app.pickOne")}</p>
        )}
      </section>
    </div>
  );
}
