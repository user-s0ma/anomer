import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useOutletContext } from "react-router";
import { PanelLeft } from "lucide-react";
import type { AppLayoutContext } from "@/app/routes/app/_layout";

/** 画面の見出しと本文。サイドバーを閉じているときは、開くボタンを左上に出す */
export function PageBody({ title, action, children }: { title?: string; action?: ReactNode; children: ReactNode }) {
  const { t } = useTranslation();
  const { sidebarOpen, openSidebar } = useOutletContext<AppLayoutContext>();
  return (
    <>
      <button
        className={`fixed top-0 left-0 z-20 m-2 flex size-10 items-center justify-center rounded-2xl text-black/50 backdrop-blur hover:text-black ${
          sidebarOpen ? "lg:hidden" : ""
        }`}
        type="button"
        aria-label={t("app.openMenu")}
        onClick={openSidebar}
      >
        <PanelLeft className="size-4" />
      </button>
      {title && (
        <header className="sticky top-0 z-10 mx-auto flex max-w-5xl items-center justify-between gap-2 bg-white/90 px-4 pt-12 pb-3 backdrop-blur">
          <h1 className="pl-2 text-xl font-semibold">{title}</h1>
          {action}
        </header>
      )}
      <main className="mx-auto w-full max-w-5xl px-4 py-2 pb-16">{children}</main>
    </>
  );
}
