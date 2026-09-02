"use client";

import { getOfflineLockConfig, saveOfflineLockConfig } from "@/lib/pwa/indexed-db";

function randomBytes(length = 32) { const bytes = new Uint8Array(length); crypto.getRandomValues(bytes); return bytes; }
function encode(value: ArrayBuffer) { return btoa(String.fromCharCode(...new Uint8Array(value))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", ""); }
function decode(value: string) { const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - value.length % 4) % 4); return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0)); }

export function supportsOfflineDeviceLock() { return typeof PublicKeyCredential !== "undefined" && Boolean(navigator.credentials); }

export async function enableOfflineDeviceLock(organizationId: string, organizationName: string, userId: string) {
  if (!supportsOfflineDeviceLock()) throw new Error("A device biometric or PIN authenticator is not available in this browser.");
  const credential = await navigator.credentials.create({ publicKey: { challenge: randomBytes(), rp: { name: "Rock Frost Business Suite", id: location.hostname }, user: { id: new TextEncoder().encode(`${organizationId}:${userId}`).slice(0, 64), name: userId, displayName: `${organizationName} offline user` }, pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }], authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "preferred", userVerification: "required" }, timeout: 60_000, attestation: "none" } }) as PublicKeyCredential | null;
  if (!credential) throw new Error("Device lock setup was cancelled.");
  await saveOfflineLockConfig({ key: `lock:${organizationId}:${userId}`, organizationId, userId, credentialId: encode(credential.rawId), enabled: true });
}

export async function unlockOfflineDevice(organizationId: string, userId: string) {
  const config = await getOfflineLockConfig(organizationId, userId);
  if (!config?.enabled) return true;
  const assertion = await navigator.credentials.get({ publicKey: { challenge: randomBytes(), rpId: location.hostname, allowCredentials: [{ type: "public-key", id: decode(config.credentialId) }], userVerification: "required", timeout: 60_000 } });
  return Boolean(assertion);
}

export async function disableOfflineDeviceLock(organizationId: string, userId: string) {
  const config = await getOfflineLockConfig(organizationId, userId);
  if (config) await saveOfflineLockConfig({ ...config, enabled: false });
}
