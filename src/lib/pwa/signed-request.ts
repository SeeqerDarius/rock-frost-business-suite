import "server-only";

import { webcrypto } from "node:crypto";
import type { Prisma } from "@prisma/client";

function decode(value: string) {
  return Uint8Array.from(Buffer.from(value, "base64url"));
}

export async function verifyOfflineRequestSignature(
  request: Request,
  body: string,
  publicKey: Prisma.JsonValue | null,
) {
  const timestamp = request.headers.get("x-rf-offline-timestamp");
  const signature = request.headers.get("x-rf-offline-signature");
  if (!timestamp || !signature || !publicKey || typeof publicKey !== "object" || Array.isArray(publicKey)) return false;
  const timestampMs = Date.parse(timestamp);
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) return false;
  try {
    const key = await webcrypto.subtle.importKey("jwk", publicKey as JsonWebKey, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    return await webcrypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, decode(signature), new TextEncoder().encode(`${timestamp}\n${body}`));
  } catch { return false; }
}
