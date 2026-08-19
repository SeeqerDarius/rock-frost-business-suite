import "server-only";

import Groq from "groq-sdk";

let client: Groq | null | undefined;

/** Returns null if GROQ_API_KEY is unset, so callers can degrade gracefully instead of crashing. */
export function getGroqClient(): Groq | null {
  if (client !== undefined) return client;
  client = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
  return client;
}

/**
 * The model powering the support assistant. Groq deprecates and rotates free-tier
 * models periodically (llama-3.3-70b-versatile was retired 2026-08-16) - check
 * https://console.groq.com/docs/models for the current production model list
 * before changing this.
 */
export const SUPPORT_ASSISTANT_MODEL = "openai/gpt-oss-120b";
