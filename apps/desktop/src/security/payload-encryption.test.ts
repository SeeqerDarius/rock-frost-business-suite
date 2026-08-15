import { describe, expect, it } from "vitest";
import {
  AesGcmPayloadEncryptor,
  exportEncryptionKey,
  generateEncryptionKey,
  importEncryptionKey,
  NoSessionPayloadEncryptor,
} from "@/security/payload-encryption";

describe("AesGcmPayloadEncryptor", () => {
  it("round-trips an arbitrary JSON-serializable payload", async () => {
    const key = await generateEncryptionKey();
    const encryptor = new AesGcmPayloadEncryptor(key);
    const original = { amount: "125.50", currency: "GHS", lines: [{ item: "Widget", qty: 3 }], note: null };

    const encrypted = await encryptor.encrypt(original);
    expect(encrypted.ciphertext).not.toContain("125.50"); // sanity: not accidentally plaintext
    const decrypted = await encryptor.decrypt(encrypted);

    expect(decrypted).toEqual(original);
  });

  it("produces a different ciphertext each time even for the same plaintext (random IV per call)", async () => {
    const key = await generateEncryptionKey();
    const encryptor = new AesGcmPayloadEncryptor(key);
    const first = await encryptor.encrypt({ value: 1 });
    const second = await encryptor.encrypt({ value: 1 });
    expect(first.ciphertext).not.toBe(second.ciphertext);
    expect(first.iv).not.toBe(second.iv);
  });

  it("fails to decrypt with the wrong key", async () => {
    const keyA = await generateEncryptionKey();
    const keyB = await generateEncryptionKey();
    const encrypted = await new AesGcmPayloadEncryptor(keyA).encrypt({ secret: true });
    await expect(new AesGcmPayloadEncryptor(keyB).decrypt(encrypted)).rejects.toThrow();
  });

  it("exportEncryptionKey/importEncryptionKey round-trip a usable key", async () => {
    const key = await generateEncryptionKey();
    const exported = await exportEncryptionKey(key);
    const imported = await importEncryptionKey(exported);

    const encrypted = await new AesGcmPayloadEncryptor(key).encrypt({ hello: "world" });
    const decrypted = await new AesGcmPayloadEncryptor(imported).decrypt(encrypted);
    expect(decrypted).toEqual({ hello: "world" });
  });
});

describe("NoSessionPayloadEncryptor", () => {
  it("throws on encrypt and decrypt rather than silently succeeding", async () => {
    const encryptor = new NoSessionPayloadEncryptor();
    await expect(encryptor.encrypt({ a: 1 })).rejects.toThrow();
    await expect(encryptor.decrypt({ ciphertext: "", iv: "" })).rejects.toThrow();
  });
});
