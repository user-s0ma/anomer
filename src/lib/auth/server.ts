import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthEndpoint, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import { captcha } from "better-auth/plugins";
import { getDb } from "../db/client";
import * as schema from "../db/schema";
import { DEMO_EMAIL, DEMO_NAME } from "./demo";

/** Turnstile を外すのは、キーが空で、しかも http:// (手元) のときだけ */
function turnstileDisabled(env: AppEnv, baseURL: string) {
  if (env.TURNSTILE_SECRET_KEY?.trim()) return false;
  if (!baseURL.startsWith("http://")) throw new Error("TURNSTILE_SECRET_KEY が設定されていません");
  return true;
}

/** お試しの共有アカウントでも使える認証の経路。ほかの経路 (パスワードやメールの変更、退会、セッションの一覧・取り消し) は止める */
const DEMO_ALLOWED_PATHS = new Set(["/get-session", "/sign-out", "/sign-in/demo"]);

/**
 * お試しの共有アカウントに入る経路。共有アカウントはパスワードを持たないので、ほかの経路からは入れない。
 * 初めて使われたときにアカウントを作る
 */
const demoSignIn = () => ({
  id: "demo",
  endpoints: {
    signInDemo: createAuthEndpoint("/sign-in/demo", { method: "POST" }, async (ctx) => {
      const adapter = ctx.context.internalAdapter;
      const found = await adapter.findUserByEmail(DEMO_EMAIL);
      const demoUser =
        found?.user ??
        (await adapter.createUser({ email: DEMO_EMAIL, name: DEMO_NAME, emailVerified: true, createdAt: new Date(), updatedAt: new Date() }));
      const session = await adapter.createSession(demoUser.id);
      await setSessionCookie(ctx, { session, user: demoUser });
      return ctx.json({ ok: true });
    }),
  },
  hooks: {
    before: [
      {
        matcher: (ctx: { path?: string }) => !DEMO_ALLOWED_PATHS.has(ctx.path ?? ""),
        handler: createAuthMiddleware(async (ctx) => {
          const current = await getSessionFromCtx(ctx, { disableRefresh: true });
          if (current?.user.email === DEMO_EMAIL) {
            throw new APIError("FORBIDDEN", { message: "The demo account cannot change account settings." });
          }
        }),
      },
    ],
  },
});

function createAuth(env: AppEnv, baseURL: string) {
  return betterAuth({
    appName: "Anomer",
    secret: env.BETTER_AUTH_SECRET,
    baseURL,
    database: drizzleAdapter(getDb(env), { provider: "sqlite", schema }),
    emailAndPassword: {
      enabled: true,
      // 確認のメールは送らない (ハッカソンの間はメールの送信を持たない)
      requireEmailVerification: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    user: { deleteUser: { enabled: true } },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    advanced: {
      database: { generateId: "uuid" },
      cookies: {
        session_token: {
          name: "anomer_session",
          options: { httpOnly: true, secure: !baseURL.startsWith("http://localhost"), sameSite: "lax" },
        },
      },
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    plugins: [
      demoSignIn(),
      captcha({
        provider: "cloudflare-turnstile",
        allowedHostnames: [new URL(baseURL).hostname],
        // 手元 (http://) でキーが空なら、どこにも当たらない経路だけを指定して外す
        ...(turnstileDisabled(env, baseURL)
          ? { secretKey: "disabled-in-local-development", endpoints: ["/__captcha-disabled-in-local-development"] }
          : { secretKey: env.TURNSTILE_SECRET_KEY, endpoints: ["/sign-up/email", "/sign-in/email", "/sign-in/demo"] }),
      }),
    ],
  });
}

export const auth = (env: AppEnv, requestOrigin?: string) => createAuth(env, requestOrigin || env.VITE_PUBLIC_APP_URL);

export async function getSession(env: AppEnv, request: Request) {
  return auth(env, new URL(request.url).origin).api.getSession({ headers: request.headers });
}
