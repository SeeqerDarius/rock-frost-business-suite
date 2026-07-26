import { describe, it, expect, vi, beforeEach } from "vitest";

const mockDb = {
  contactSubmission: { findFirst: vi.fn(), create: vi.fn() },
  module: { findFirst: vi.fn() },
  organizationMember: { findMany: vi.fn() },
  notification: { createMany: vi.fn() },
};
const mockSendEmail = vi.fn();

class RedirectSignal extends Error {
  constructor(public url: string) {
    super(`redirect:${url}`);
  }
}

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/email", () => ({ sendEmail: mockSendEmail }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
}));

const { submitContactForm } = await import("@/app/(public)/contact/actions");

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.RESEND_TO_EMAIL = "sales@rockfrostgroup.com";
  mockDb.contactSubmission.create.mockResolvedValue({ id: "submission-1" });
  mockDb.organizationMember.findMany.mockResolvedValue([]);
});

/**
 * Regression tests for the audit's confirmed public contact-form gaps: no
 * email format validation, no length limits, no rate limiting, and raw HTML
 * injection into the outbound notification email.
 */
describe("submitContactForm — validation, rate limiting, HTML escaping", () => {
  it("rejects a malformed email before ever querying the database", async () => {
    await expect(
      submitContactForm(formData({ name: "Alice", company: "Acme", email: "not-an-email", reason: "general", message: "" })),
    ).rejects.toThrow("?error=missing-fields");
    expect(mockDb.contactSubmission.findFirst).not.toHaveBeenCalled();
  });

  it("rejects a resubmission from the same email within the cooldown window", async () => {
    mockDb.contactSubmission.findFirst.mockResolvedValue({ id: "prev-1", createdAt: new Date() });

    await expect(
      submitContactForm(formData({ name: "Alice", company: "Acme", email: "alice@example.com", reason: "general", message: "hi" })),
    ).rejects.toThrow("?error=too-soon");
    expect(mockDb.contactSubmission.create).not.toHaveBeenCalled();
  });

  it("HTML-escapes submitted fields before interpolating them into the outbound email", async () => {
    mockDb.contactSubmission.findFirst.mockResolvedValue(null);
    mockSendEmail.mockResolvedValue({ ok: true });

    await expect(
      submitContactForm(
        formData({
          name: '<script>alert(1)</script>',
          company: "Acme",
          email: "attacker@example.com",
          reason: "general",
          message: "hello",
        }),
      ),
    ).rejects.toThrow("?sent=1");

    expect(mockSendEmail).toHaveBeenCalled();
    const call = mockSendEmail.mock.calls[0][0];
    expect(call.html).not.toContain("<script>");
    expect(call.html).toContain("&lt;script&gt;");
  });

  it("persists the submission even when RESEND_TO_EMAIL is unset, instead of only logging and forgetting", async () => {
    delete process.env.RESEND_TO_EMAIL;
    mockDb.contactSubmission.findFirst.mockResolvedValue(null);
    mockDb.contactSubmission.create.mockResolvedValue({});

    await expect(
      submitContactForm(formData({ name: "Bob", company: "Acme", email: "bob@example.com", reason: "general", message: "" })),
    ).rejects.toThrow("?sent=1");

    expect(mockDb.contactSubmission.create).toHaveBeenCalled();
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("stores a module-specific WhatsApp request and notifies platform operators", async () => {
    mockDb.contactSubmission.findFirst.mockResolvedValue(null);
    mockDb.module.findFirst.mockResolvedValue({ id: "module-fleet", name: "Fleet Management" });
    mockDb.organizationMember.findMany.mockResolvedValue([
      { organizationId: "platform-org", userId: "operator-1" },
    ]);

    await expect(
      submitContactForm(formData({
        name: "Ama",
        company: "Acme Logistics",
        email: "ama@example.com",
        phone: "+233200000000",
        preferredContact: "WHATSAPP",
        intent: "MODULE",
        moduleCode: "fleet",
        expectedUsers: "20",
        country: "Ghana",
        industry: "Logistics",
        reason: "module",
        message: "We need fleet operations.",
      })),
    ).rejects.toThrow("?sent=1");

    expect(mockDb.contactSubmission.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        moduleId: "module-fleet",
        preferredContact: "WHATSAPP",
        intent: "MODULE",
        phone: "+233200000000",
        expectedUsers: 20,
      }),
    });
    expect(mockDb.notification.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ userId: "operator-1", type: "PUBLIC_MODULE_ENQUIRY" })],
      skipDuplicates: true,
    });
  });
});
