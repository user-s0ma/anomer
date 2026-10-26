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
import { connectSource, disconnectSource, getShop, listConnections, loadSeries, SourceError, syncShopData } from "@/lib/shop/service";
import { SOURCES } from "@/lib/sources/definitions";
import { createStarterShop, DEMO_SHOP, suggestedQuestions } from "@/lib/shop/setup";
import { CITIES, CITY_BY_ID } from "@/lib/sources/cities";
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
  return createStarterShop(env, user.id, input, seed);
}

app.get("/me", async (c) => {
  const user = c.get("user");
  const shop = await shopFor(c.env, user);
  return c.json({
    user: { name: user.name, email: user.email, demo: isDemoUser(user) },
    shop: shop && { name: shop.name, city: shop.city, dataStart: shop.dataStart },
    cities: CITIES.map((city) => ({ id: city.id, label: city.label })),
    suggestions: shop ? suggestedQuestions(await listConnections(c.env, shop.userId), localeFromRequest(c.req.raw)) : [],
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
  await createStarterShop(c.env, user.id, parsed.data, seed);
  return c.json({ ok: true });
});

/** 使えるデータ源と、店がつないだデータ源 (設定つき) */
app.get("/sources", async (c) => {
  const shop = await shopFor(c.env, c.get("user"));
  if (!shop) return c.json({ message: "Create your shop first." }, 404);
  const connections = await listConnections(c.env, shop.userId);
  return c.json({ available: SOURCES, connected: connections });
});

app.post("/sources", async (c) => {
  const user = c.get("user");
  if (isDemoUser(user)) return c.json({ message: "The demo account cannot change data sources." }, 403);
  const body = z
    .object({ sourceId: z.string().min(1).max(64), settings: z.record(z.string(), z.unknown()) })
    .safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ message: "Please check the settings." }, 400);
  try {
    await connectSource(c.env, user.id, body.data.sourceId, body.data.settings);
  } catch (error) {
    if (error instanceof SourceError) return c.json({ message: error.message }, 400);
    throw error;
  }
  return c.json({ ok: true });
});

app.delete("/sources/:id", async (c) => {
  const user = c.get("user");
  if (isDemoUser(user)) return c.json({ message: "The demo account cannot change data sources." }, 403);
  try {
    await disconnectSource(c.env, user.id, c.req.param("id"));
  } catch (error) {
    if (error instanceof SourceError) return c.json({ message: error.message }, 400);
    throw error;
  }
  return c.json({ ok: true });
});

/** つないだデータ源と、その数字の日別の値 (グラフ用) */
app.get("/data", async (c) => {
  const shop = await shopFor(c.env, c.get("user"));
  if (!shop) return c.json({ message: "Create your shop first." }, 404);
  // データ源をつないだり外したりした直後は、ここで値をそろえ直す
  await syncShopData(c.env, shop);
  const { dates, values, sources } = await loadSeries(c.env, shop);
  return c.json({
    dates,
    sources: sources.map((source) => ({
      ...source,
      metrics: source.metrics.map((m) => ({ ...m, values: values.get(m.key) ?? [] })),
    })),
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
