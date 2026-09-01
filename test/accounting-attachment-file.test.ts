import { describe, expect, it } from "vitest";
import { accountingAttachmentFileData, MAX_ACCOUNTING_ATTACHMENT_BYTES } from "@/lib/accounting-attachment-file";

function file(bytes: number[], type: string, name = "upload") {
  return new File([new Uint8Array(bytes)], name, { type });
}

const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

describe("accountingAttachmentFileData", () => {
  it("returns null for an empty file", async () => {
    await expect(accountingAttachmentFileData(file([], "application/pdf"))).resolves.toBeNull();
  });

  it("accepts a real PDF and returns a data URI", async () => {
    const result = await accountingAttachmentFileData(file(PDF_SIGNATURE, "application/pdf", "invoice.pdf"));

    expect(result).not.toBeNull();
    expect(result?.mimeType).toBe("application/pdf");
    expect(result?.dataUrl).toMatch(/^data:application\/pdf;base64,/);
  });

  it("accepts a real PNG", async () => {
    const result = await accountingAttachmentFileData(file(PNG_SIGNATURE, "image/png", "receipt.png"));

    expect(result?.mimeType).toBe("image/png");
  });

  it("rejects a file whose declared type does not match its actual byte signature", async () => {
    // Reports itself as a PDF but the bytes are a PNG signature - a spoofed MIME type.
    await expect(accountingAttachmentFileData(file(PNG_SIGNATURE, "application/pdf"))).rejects.toThrow("invalid-accounting-attachment");
  });

  it("rejects a disallowed MIME type even with no byte-signature check reached", async () => {
    await expect(accountingAttachmentFileData(file(PDF_SIGNATURE, "application/zip"))).rejects.toThrow("invalid-accounting-attachment");
  });

  it("rejects a file larger than the size cap", async () => {
    const big = new File([new Uint8Array(MAX_ACCOUNTING_ATTACHMENT_BYTES + 1)], "big.pdf", { type: "application/pdf" });

    await expect(accountingAttachmentFileData(big)).rejects.toThrow("invalid-accounting-attachment");
  });
});
