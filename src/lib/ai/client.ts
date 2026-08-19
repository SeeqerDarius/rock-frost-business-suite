import "server-only";

import Groq from "groq-sdk";

let client: Groq | null | undefined;

/** Returns null if GROQ_API_KEY is unset, so callers can degrade gracefully instead of crashing. */
export function getGroqClient(): Groq | null {
  if (client !== undefined) return client;
  client = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
  return client;
}

/** The model powering the support assistant. Llama 3.3 70B is Groq's general-purpose tool-calling model. */
export const SUPPORT_ASSISTANT_MODEL = "llama-3.3-70b-versatile";
