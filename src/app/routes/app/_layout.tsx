import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { NavLink, Outlet, redirect, useLocation, useNavigate } from "react-router";
import type { Route } from "./+types/_layout";
import { LanguageSwitcher, Logo } from "@/components/ui";
import { authClient, getMe } from "@/lib/api-client";
import { getSession } from "@/lib/auth/server";
import { appContext } from "@/lib/util/app-context";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { env } = context.get(appContext);
  if (!(await getSession(env, request))) throw redirect("/login");
  return null;
}

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: getMe });
}

export default function AppLayout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const me = useMe();

  // 店がまだなければ設定へ
  useEffect(() => {
    if (me.data && !me.data.shop && location.pathname !== "/app/setup") navigate("/app/setup");
  }, [me.data, location.pathname, navigate]);

  const signOut = async () => {
    await authClient.signOut();
    window.location.href = "/";
  };

  const tab = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${isActive ? "bg-sunken text-ink" : "text-ink-soft hover:text-ink"}`;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <Logo />
            {me.data?.shop && (
              <span className="hidden truncate text-sm text-ink-soft sm:inline">
                {me.data.shop.name} · {me.data.shop.city}
              </span>
            )}
            {me.data?.user.demo && <span className="rounded-full bg-accent-tint px-2 py-0.5 text-xs font-semibold text-accent">{t("app.demoBadge")}</span>}
          </div>
          <div className="flex items-center gap-2">
            {me.data?.shop && (
              <nav className="flex gap-1">
                <NavLink to="/app" end className={tab}>
                  {t("app.nav.ask")}
                </NavLink>
                <NavLink to="/app/data" className={tab}>
                  {t("app.nav.data")}
                </NavLink>
              </nav>
            )}
            <LanguageSwitcher />
            <button type="button" onClick={signOut} className="text-sm text-ink-soft hover:text-ink">
              {t("common.signOut")}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {me.isPending ? <p className="text-sm text-ink-mute">{t("common.loading")}</p> : me.isError ? <p className="text-sm text-danger">{t("common.error")}</p> : <Outlet />}
      </main>
    </div>
  );
}
