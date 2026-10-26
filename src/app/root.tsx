import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useRouteLoaderData } from "react-router";
import { Toaster } from "sonner";
import type { Route } from "./+types/root";
import { translate } from "@/lib/i18n";
import { localeFromRequest } from "@/lib/i18n/locale";
import "@fontsource-variable/inter";
import "@fontsource-variable/noto-sans-jp";
import "./globals.css";

export async function loader({ request }: Route.LoaderArgs) {
  return { locale: localeFromRequest(request) };
}

export function meta({ loaderData }: Route.MetaArgs): Route.MetaDescriptors {
  const locale = loaderData?.locale ?? "en";
  const title = translate(locale, "site.title");
  const description = translate(locale, "site.description");
  return [
    { title },
    { name: "description", content: description },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ];
}

export function links(): Route.LinkDescriptors {
  return [{ rel: "icon", href: "/icon.svg", type: "image/svg+xml" }];
}

export function Layout({ children }: { children: React.ReactNode }) {
  const data = useRouteLoaderData("root") as { locale?: Locale } | undefined;
  const locale = data?.locale ?? "en";
  const { i18n } = useTranslation();
  useEffect(() => {
    if (i18n.language !== locale) void i18n.changeLanguage(locale);
  }, [i18n, locale]);

  return (
    <html lang={locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <Meta />
        <Links />
      </head>
      <body className="min-h-dvh bg-white text-black">
        {children}
        <Toaster richColors position="top-center" />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function Root() {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } }));
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
