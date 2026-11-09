import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import type { z } from 'zod';

export function aiConfigured() {
  return Boolean(process.env.AI_API_KEY && process.env.AI_MODEL);
}

/** Use the OpenAI API or an OpenAI-compatible chat endpoint selected by env. */
export async function structuredDecision<T extends z.ZodTypeAny>(
  schema: T,
  system: string,
  prompt: string
): Promise<z.infer<T>> {
  if (!aiConfigured()) throw new Error('AI_API_KEY and AI_MODEL are required for live AI decisions');
  const provider = createOpenAI({
    apiKey: process.env.AI_API_KEY!,
    ...(process.env.AI_BASE_URL ? { baseURL: process.env.AI_BASE_URL } : {})
  });
  const { output } = await generateText({
    model: provider.chat(process.env.AI_MODEL!),
    system,
    prompt,
    output: Output.object({ schema }),
    temperature: 0.2
  });
  return schema.parse(output);
}
