import { Hono } from "hono";
import { stream } from "hono/streaming";
import { z } from "zod";
import { isDemoUser } from "@/lib/auth/demo";
import { getSession } from "@/lib/auth/server";
import { localeFromRequest } from "@/lib/i18n/locale";
import {
  consumeQuota,
  getInvestigation,
  listInvestigations,
  runInvestigation,
} from "@/lib/investigations/service";
import { createShop, DEMO_SHOP, getShop, loadSeries } from "@/lib/shop/service";
import { METRICS, SOURCES } from "@/lib/sources/catalog";
import { CITIES, CITY_BY_ID } from "@/lib/sources/cities";
import type { SimulationEvents } from "@/lib/sources/simulator";
import { addDays } from "@/lib/util/dates";
import type { ApiEnv } from "./types";

const app = new Hono<ApiEnv>();

app.use("*", async (c, next) => {
  const session = await getSession(c.env, c.req.raw);
  if (!session) return c.json({ message: "Please sign in." }, 401);
  c.set("user", session.user);
  await next();
});

/** お試しのアカウントは、初めて開いたときに架空の店を作る */
async function shopFor(env: AppEnv, user: { id: string; email: string }) {
  const found = await getShop(env, user.id);
  if (found || !isDemoUser(user)) return found;
  const { seed, ...input } = DEMO_SHOP;
  return createShop(env, user.id, input, seed);
}

/** 聞いてみる質問の例。仕込んだ原因の日付に合わせる (広告は止めた翌日から効く) */
function suggestions(events: SimulationEvents, locale: Locale) {
  const day = (date: string) =>
    new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
  const from = day(addDays(events.adsPaused.start, 1));
  const to = day(addDays(events.adsPaused.end, 1));
  const viral = day(events.viralReel);
  return locale === "ja"
    ? [`${from}〜${to}の注文が減ったのはなぜ？`, `${viral}に注文が跳ねたのはなぜ？`, "先週の売上が変わったのはなぜ？", "先月、ウェブサイトのタップが増えたのはなぜ？"]
    : [`Why were orders lower from ${from} to ${to}?`, `Why did orders jump on ${viral}?`, "Why did revenue change last week?", "What drove website taps last month?"];
}

app.get("/me", async (c) => {
  const user = c.get("user");
  const shop = await shopFor(c.env, user);
  return c.json({
    user: { name: user.name, email: user.email, demo: isDemoUser(user) },
    shop: shop && { name: shop.name, city: CITY_BY_ID.get(shop.cityId)!.label, dataStart: shop.dataStart },
    cities: CITIES.map((city) => ({ id: city.id, label: city.label })),
    suggestions: shop ? suggestions(JSON.parse(shop.simulationEvents) as SimulationEvents, localeFromRequest(c.req.raw)) : [],
  });
});

const shopInput = z.object({
  name: z.string().trim().min(1).max(80),
  cityId: z.string().refine((id) => CITY_BY_ID.has(id)),
});

app.post("/shop", async (c) => {
  const user = c.get("user");
  if (isDemoUser(user)) return c.json({ message: "The demo account cannot create a shop." }, 403);
  const parsed = shopInput.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ message: "Please check the shop details." }, 400);
  if (await getShop(c.env, user.id)) return c.json({ message: "You already have a shop." }, 409);
  // 登録した人の店も、データは架空 (シミュレーター) で、天気だけは選んだ都市の本物
  const seed = crypto.getRandomValues(new Uint32Array(1))[0];
  await createShop(c.env, user.id, parsed.data, seed);
  return c.json({ ok: true });
});

/** データ源と数字の一覧、日別の値 (グラフ用) */
app.get("/data", async (c) => {
  const shop = await shopFor(c.env, c.get("user"));
  if (!shop) return c.json({ message: "Create your shop first." }, 404);
  const { dates, values } = await loadSeries(c.env, shop);
  return c.json({
    sources: SOURCES,
    metrics: METRICS.map((m) => ({ ...m, values: values.get(m.key) ?? [] })),
    dates,
  });
});

app.get("/investigations", async (c) => {
  return c.json({ items: await listInvestigations(c.env, c.get("user").id) });
});

app.get("/investigations/:id", async (c) => {
  const found = await getInvestigation(c.env, c.get("user").id, c.req.param("id"));
  return found ? c.json(found) : c.json({ message: "Not found." }, 404);
});

async function visitorKey(env: AppEnv, request: Request) {
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${env.BETTER_AUTH_SECRET}:${ip}`));
  return [...new Uint8Array(digest).slice(0, 12)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 質問して調べる。進み具合を1行ずつの JSON (NDJSON) で返し、最後の行が結果
 */
app.post("/investigations", async (c) => {
  const user = c.get("user");
  const body = z.object({ question: z.string().trim().min(3).max(500) }).safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ message: "Please write a question." }, 400);
  const shop = await shopFor(c.env, user);
  if (!shop) return c.json({ message: "Create your shop first." }, 404);

  const limits = [{ key: "total", limit: Number(c.env.DAILY_INVESTIGATIONS_TOTAL) }];
  if (isDemoUser(user)) {
    limits.push({ key: `visitor:${await visitorKey(c.env, c.req.raw)}`, limit: Number(c.env.DAILY_INVESTIGATIONS_PER_DEMO_VISITOR) });
  } else {
    limits.push({ key: `user:${user.id}`, limit: Number(c.env.DAILY_INVESTIGATIONS_PER_USER) });
  }
  if (!(await consumeQuota(c.env, limits))) {
    return c.json({ message: "You have reached today's limit of questions. Please try again tomorrow." }, 429);
  }

  const locale = localeFromRequest(c.req.raw);
  c.header("Content-Type", "application/x-ndjson");
  c.header("Cache-Control", "no-store");
  return stream(c, async (out) => {
    const view = await runInvestigation(c.env, { shop, question: body.data.question, locale }, async (step, id) => {
      await out.writeln(JSON.stringify({ type: "step", step, id }));
    });
    await out.writeln(JSON.stringify({ type: "result", investigation: view }));
  });
});

export default app;
