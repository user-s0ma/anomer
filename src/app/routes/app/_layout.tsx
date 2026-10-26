import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link, Outlet, redirect, useLoaderData, useLocation, useNavigate } from "react-router";
import { LoaderCircle, LogOut, PanelLeft, Plug, SquarePen } from "lucide-react";
import { toast } from "sonner";
import type { Route } from "./+types/_layout";
import { LanguageSwitcher, Logo } from "@/components/ui";
import {
  ApiError,
  ask,
  authClient,
  getMe,
  listInvestigations,
  type DataResponse,
  type getSources,
  type InvestigationStep,
  type InvestigationView,
  type Me,
} from "@/lib/api-client";
import { getSession } from "@/lib/auth/server";
import { appContext } from "@/lib/util/app-context";
import api from "@/server/api";

/**
 * 画面を返す前に、サーバーで使う値を読んでおく (最初の表示から中身が出るように)。
 * 店はここで初めて作られることがあるので、/api/me を先に読む
 */
export async function loader({ request, context }: Route.LoaderArgs) {
  const { env, ctx } = context.get(appContext);
  if (!(await getSession(env, request))) throw redirect("/login");
  const get = async <T,>(path: string): Promise<T | null> => {
    const response = await api.fetch(new Request(new URL(path, request.url), { headers: request.headers }), env, ctx);
    return response.ok ? ((await response.json()) as T) : null;
  };
  const me = await get<Me>("/api/me");
  const [investigations, sources, data] = me?.shop
    ? await Promise.all([
        get<{ items: InvestigationView[] }>("/api/investigations"),
        get<Awaited<ReturnType<typeof getSources>>>("/api/sources"),
        get<DataResponse>("/api/data"),
      ])
    : [null, null, null];
  return { me, investigations, sources, data };
}

/** 読み込んだあとは react-query が値を持つので、画面を移るたびには読み直さない */
export function shouldRevalidate() {
  return false;
}

export type Running = { question: string; step: InvestigationStep };

export type AppLayoutContext = {
  sidebarOpen: boolean;
  openSidebar: () => void;
  running: Running | null;
  submitQuestion: (question: string) => void;
};

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: getMe });
}

export function useInvestigations() {
  return useQuery({ queryKey: ["investigations"], queryFn: listInvestigations });
}

export default function AppLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const preloaded = useLoaderData<typeof loader>();
  // サーバーで読んだ値を、子の画面が使う前に入れておく
  useState(() => {
    for (const [key, value] of Object.entries(preloaded)) {
      if (value !== null && queryClient.getQueryData([key]) === undefined) queryClient.setQueryData([key], value);
    }
  });
  const me = useMe();
  const list = useInvestigations();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [running, setRunning] = useState<Running | null>(null);

  // 店がまだなければ設定へ
  useEffect(() => {
    if (me.data && !me.data.shop && location.pathname !== "/app/setup") navigate("/app/setup");
  }, [me.data, location.pathname, navigate]);

  const submitQuestion = (text: string) => {
    const question = text.trim();
    if (question.length < 3 || running) return;
    setRunning({ question, step: "data" });
    navigate("/app");
    ask(question, (step) => setRunning({ question, step }))
      .then(async (view) => {
        await queryClient.invalidateQueries({ queryKey: ["investigations"] });
        navigate(`/app/q/${view.id}`);
      })
      .catch((error) => toast.error(error instanceof ApiError && error.status === 429 ? t("app.limit") : t("common.error")))
      .finally(() => setRunning(null));
  };

  const signOut = async () => {
    await authClient.signOut();
    window.location.href = "/";
  };

  const path = location.pathname.replace(/\/$/, "");
  const close = () => setMobileOpen(false);
  const items = list.data?.items ?? [];

  return (
    <div className="min-h-dvh font-sans">
      {mobileOpen && <button className="fixed inset-0 z-30 lg:hidden" type="button" aria-label={t("app.closeMenu")} onClick={close} />}
      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-64 flex-col border-r border-black/20 bg-white/80 backdrop-blur transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${sidebarOpen ? "lg:translate-x-0" : "lg:-translate-x-full"}`}
      >
        <div className="flex h-14 items-center justify-between px-2">
          <Link to="/app" className="px-2" onClick={close}>
            <Logo className="text-lg" />
          </Link>
          <LanguageSwitcher className="ml-auto" />
          <button
            className="flex size-10 items-center justify-center rounded-2xl text-black/50 hover:bg-black/10 hover:text-black"
            type="button"
            aria-label={t("app.closeMenu")}
            onClick={() => {
              setSidebarOpen(false);
              close();
            }}
          >
            <PanelLeft className="size-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2 pb-2">
          <Link to="/app" onClick={close} className={`nav-item ${path === "/app" ? "bg-accent/10 text-accent" : ""}`}>
            <SquarePen className="size-4" />
            {t("app.nav.ask")}
          </Link>
          <Link to="/app/sources" onClick={close} className={`nav-item ${path === "/app/sources" ? "bg-accent/10 text-accent" : ""}`}>
            <Plug className="size-4" />
            {t("app.nav.sources")}
          </Link>

          {(running || items.length > 0) && <p className="px-2 pt-4 pb-1 text-xs font-semibold">{t("app.history")}</p>}
          {running && (
            <div className="nav-item text-black/50">
              <LoaderCircle className="size-4 shrink-0 animate-spin" />
              <span className="truncate">{running.question}</span>
            </div>
          )}
          {items.map((item) => (
            <Link
              key={item.id}
              to={`/app/q/${item.id}`}
              onClick={close}
              title={item.question}
              className={`nav-item ${path === `/app/q/${item.id}` ? "bg-accent/10 text-accent" : ""} ${item.status === "failed" ? "text-black/50" : ""}`}
            >
              <span className="truncate">{item.question}</span>
            </Link>
          ))}
        </nav>

        <div className="m-2 flex items-center justify-between gap-2 rounded-xl p-2">
          <div className="flex min-w-0 items-center gap-2">
            {/* アカウントと店は1対1なので、店の名前で出す (店を作る前は名前) */}
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-on-accent">
              {(me.data?.shop?.name ?? me.data?.user.name ?? "?").charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm">{me.data?.shop?.name ?? me.data?.user.name}</span>
              {me.data?.shop && <span className="block truncate text-xs text-black/50">{me.data.shop.city}</span>}
            </span>
          </div>
          <div className="flex items-center">
            <button
              type="button"
              onClick={signOut}
              className="flex size-8 items-center justify-center rounded-full text-black/50 hover:bg-black/10 hover:text-black"
              aria-label={t("common.signOut")}
              title={t("common.signOut")}
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className={`min-h-dvh ${sidebarOpen ? "lg:pl-64" : ""}`}>
        {me.isPending ? null : me.isError ? (
          <p className="p-6 text-sm text-down">{t("common.error")}</p>
        ) : (
          <Outlet
            context={
              {
                sidebarOpen,
                openSidebar: () => {
                  setSidebarOpen(true);
                  setMobileOpen(true);
                },
                running,
                submitQuestion,
              } satisfies AppLayoutContext
            }
          />
        )}
      </div>
    </div>
  );
}
