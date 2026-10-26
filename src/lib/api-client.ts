import { createAuthClient } from "better-auth/react";
import type { InvestigationStep, InvestigationView } from "./investigations/service";
import type { MetricDefinition, SourceDefinition } from "./sources/types";

/* 画面から呼ぶ API */

export const authClient = createAuthClient({
  baseURL: typeof window === "undefined" ? import.meta.env.VITE_PUBLIC_APP_URL : window.location.origin,
});

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const data = (await response.json().catch(() => null)) as (T & { message?: string }) | null;
  if (!response.ok) throw new ApiError(data?.message ?? response.statusText, response.status);
  return data as T;
}

/** 審査員向けのデモアカウントに入る (Turnstile の答えを付ける。手元で Turnstile が無いときは付けない) */
export async function signInDemo(captchaToken: string | null) {
  return request<{ ok: true }>("/api/auth/sign-in/demo", {
    method: "POST",
    body: "{}",
    headers: captchaToken ? { "x-captcha-response": captchaToken } : {},
  });
}

export type Me = {
  user: { name: string; email: string; demo: boolean };
  shop: { name: string; city: string; dataStart: string } | null;
  cities: { id: string; label: string }[];
  suggestions: string[];
};

export const getMe = () => request<Me>("/api/me");

export const createShop = (input: { name: string; cityId: string }) =>
  request<{ ok: true }>("/api/shop", { method: "POST", body: JSON.stringify(input) });

/** 店がつないだデータ源と、その数字の日別の値 */
export type DataResponse = {
  dates: string[];
  sources: (Omit<SourceDefinition, "metrics"> & { metrics: (MetricDefinition & { values: (number | null)[] })[] })[];
};

export const getData = () => request<DataResponse>("/api/data");

export type Connection = { sourceId: string; config: Record<string, unknown>; demo: boolean };

export const getSources = () => request<{ available: SourceDefinition[]; connected: Connection[] }>("/api/sources");

export const connectSource = (sourceId: string, settings: Record<string, unknown>, file?: { name: string; text: string }) =>
  request<{ ok: true }>("/api/sources", { method: "POST", body: JSON.stringify({ sourceId, settings, file }) });

export const disconnectSource = (sourceId: string) =>
  request<{ ok: true }>(`/api/sources/${encodeURIComponent(sourceId)}`, { method: "DELETE" });

export type { InvestigationStep, InvestigationView };

export const listInvestigations = () => request<{ items: InvestigationView[] }>("/api/investigations");

/** 質問して、進み具合を onStep で受け取りながら結果を待つ */
export async function ask(question: string, onStep: (step: InvestigationStep, id: string) => void): Promise<InvestigationView> {
  const response = await fetch("/api/investigations", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  if (!response.ok || !response.body) {
    const data = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new ApiError(data?.message ?? response.statusText, response.status);
  }
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line) continue;
      const event = JSON.parse(line) as { type: "step"; step: InvestigationStep; id: string } | { type: "result"; investigation: InvestigationView };
      if (event.type === "step") onStep(event.step, event.id);
      else return event.investigation;
    }
  }
  throw new ApiError("The answer was cut off.", 500);
}
