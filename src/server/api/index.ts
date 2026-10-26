import { Hono } from "hono";
import { auth } from "@/lib/auth/server";
import app from "./app";
import type { ApiEnv } from "./types";

const api = new Hono<ApiEnv>();

api.use("*", async (c, next) => {
  await next();
  c.header("X-Content-Type-Options", "nosniff");
  c.header("X-Frame-Options", "DENY");
  c.header("Referrer-Policy", "strict-origin-when-cross-origin");
});

api.on(["GET", "POST"], "/api/auth/*", (c) => auth(c.env, new URL(c.req.url).origin).handler(c.req.raw));
api.route("/api", app);

api.onError((error, c) => {
  console.error(error);
  return c.json({ message: "Something went wrong." }, 500);
});
api.notFound((c) => c.json({ message: "Not found." }, 404));

export default api;
