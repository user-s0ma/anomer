import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";
import { Toaster } from "sonner";
import type { Route } from "./+types/root";
import { translate } from "@/lib/i18n";
import { LOCALE } from "@/lib/i18n/locale";
import "@fontsource-variable/inter";
import "./globals.css";

export function meta(): Route.MetaDescriptors {
  const title = translate(LOCALE, "site.title");
  const description = translate(LOCALE, "site.description");
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
  return (
    <html lang={LOCALE}>
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
  const [queryClient] = useState(() => // サーバーで読んだ値をすぐに読み直さないよう、30秒は新しいものとみなす
    new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 30_000 } } }));
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
    </QueryClientProvider>
  );
}
