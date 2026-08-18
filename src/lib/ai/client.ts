import "server-only";

import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null | undefined;

/** Returns null if ANTHROPIC_API_KEY is unset, so callers can degrade gracefully instead of crashing. */
export function getAnthropicClient(): Anthropic | null {
  if (client !== undefined) return client;
  client = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
  return client;
}

/** The model powering the support assistant. Sonnet is the right tier for short, tool-augmented business Q&A. */
export const SUPPORT_ASSISTANT_MODEL = "claude-sonnet-5";
