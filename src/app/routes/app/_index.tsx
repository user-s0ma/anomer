import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router";
import { ArrowUp, Check, LoaderCircle } from "lucide-react";
import { PageBody } from "@/components/PageBody";
import type { InvestigationStep } from "@/lib/api-client";
import { useMe, type AppLayoutContext } from "./_layout";

const STEPS: InvestigationStep[] = ["data", "reading", "fitting", "explaining"];

/** 質問を書く欄。丸い枠の中に、送るボタンを置く */
function Composer({ disabled, onSubmit }: { disabled: boolean; onSubmit: (text: string) => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const send = () => {
    if (disabled || text.trim().length < 3) return;
    onSubmit(text);
    setText("");
  };
  return (
    <form
      className="flex w-full items-end gap-1 rounded-[26px] border border-black/20 bg-white p-1.5 shadow focus-within:border-black/50"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
        rows={1}
        maxLength={500}
        placeholder={t("app.askPlaceholder")}
        className="field-sizing-content max-h-48 min-h-9 flex-1 resize-none self-center bg-transparent px-3 py-2 text-base leading-6 outline-none placeholder:text-black/50"
      />
      <button
        type="submit"
        disabled={disabled || text.trim().length < 3}
        aria-label={t("app.ask")}
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-black text-white transition-opacity hover:opacity-70 disabled:bg-black/10 disabled:text-black/50"
      >
        {disabled ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowUp className="size-4" />}
      </button>
    </form>
  );
}

export default function Ask() {
  const { t } = useTranslation();
  const me = useMe();
  const { running, submitQuestion } = useOutletContext<AppLayoutContext>();

  if (running) {
    const current = STEPS.indexOf(running.step);
    return (
      <PageBody>
        <div className="mx-auto flex max-w-3xl flex-col gap-6 pt-16">
          <p className="ml-auto w-fit max-w-[85%] rounded-3xl bg-black/10 px-4 py-2.5 text-sm leading-6">{running.question}</p>
          <ol className="flex flex-col gap-2.5">
            {STEPS.map((step, i) => (
              <li
                key={step}
                className={`flex items-center gap-2.5 text-sm ${i < current ? "text-black/50" : i === current ? "font-medium" : "text-black/30"}`}
              >
                {i < current ? <Check className="size-4" /> : i === current ? <LoaderCircle className="size-4 animate-spin" /> : <span className="size-4" />}
                {t(`app.steps.${step}`)}
              </li>
            ))}
          </ol>
        </div>
      </PageBody>
    );
  }

  return (
    <PageBody>
      <div className="mx-auto flex min-h-[80dvh] max-w-3xl flex-col items-center justify-center gap-6">
        <h1 className="h-display text-center text-3xl font-semibold sm:text-4xl">{t("app.emptyTitle")}</h1>
        <Composer disabled={false} onSubmit={submitQuestion} />
        {(me.data?.suggestions.length ?? 0) > 0 && (
          <div className="flex flex-wrap justify-center gap-2">
            {me.data!.suggestions.map((s) => (
              <button key={s} type="button" className="chip" onClick={() => submitQuestion(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {me.data?.user.demo && <p className="max-w-lg text-center text-xs leading-5 text-black/50">{t("app.demoNote")}</p>}
      </div>
    </PageBody>
  );
}
