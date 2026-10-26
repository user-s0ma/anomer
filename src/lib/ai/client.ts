import OpenAI from "openai";
import { z } from "zod";

/**
 * Meta Model API (Muse Spark) を、OpenAI 互換の Chat Completions で呼ぶ。
 * 答えは JSON Schema で形を決め (structured output)、受け取ったあと zod で確かめる
 */

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type ReasoningEffort = "minimal" | "low" | "medium" | "high";

export async function askStructured<T extends z.ZodType>(
  env: AppEnv,
  options: { name: string; schema: T; messages: ChatMessage[]; effort: ReasoningEffort; maxTokens: number },
): Promise<z.infer<T>> {
  const client = new OpenAI({ apiKey: env.META_MODEL_API_KEY, baseURL: env.META_MODEL_API_BASE });
  const response = await client.chat.completions.create({
    model: env.META_MODEL,
    messages: options.messages,
    reasoning_effort: options.effort,
    // 考える分のトークンもここに入る
    max_completion_tokens: options.maxTokens,
    response_format: {
      type: "json_schema",
      json_schema: { name: options.name, schema: z.toJSONSchema(options.schema) as Record<string, unknown> },
    },
  });
  const choice = response.choices[0];
  if (choice?.finish_reason === "length") throw new Error(`${options.name}: 答えが max_tokens (${options.maxTokens}) で切れました`);
  const content = choice?.message.content;
  if (!content) throw new Error(`${options.name}: 答えが空でした (finish_reason: ${choice?.finish_reason})`);
  return options.schema.parse(JSON.parse(content));
}
