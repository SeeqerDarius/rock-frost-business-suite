import "server-only";

import Anthropic from "@anthropic-ai/sdk";

let anthropicClient: Anthropic | null = null;

export function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    return null;
  }

  if (!anthropicClient) {
    anthropicClient = new Anthropic({ apiKey });
  }

  return anthropicClient;
}
