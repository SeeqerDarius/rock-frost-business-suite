import { describe, expect, it } from "vitest";
import { invitationEmail, passwordResetEmail } from "@/lib/email-templates";

describe("transactional email templates", () => {
  it("includes HTML and plain-text invitation links with clear account context", () => {
    const message = invitationEmail({ organizationName: "Acme School", roleName: "Teacher", inviteUrl: "https://app.example/invite?token=one" });
    expect(message.subject).toContain("Acme School invited you");
    expect(message.html).toContain("https://app.example/invite?token=one");
    expect(message.text).toContain("https://app.example/invite?token=one");
    expect(message.text).toContain("expires in 7 days");
  });

  it("escapes tenant-controlled content in HTML", () => {
    const message = invitationEmail({ organizationName: '<img src=x onerror="alert(1)">', roleName: "Owner & Admin", inviteUrl: "https://app.example/invite" });
    expect(message.html).not.toContain("<img src=x");
    expect(message.html).toContain("&lt;img src=x");
    expect(message.html).toContain("Owner &amp; Admin");
  });

  it("explains password-reset expiry and unsolicited-request handling", () => {
    const message = passwordResetEmail("https://app.example/reset-password?token=one");
    expect(message.html).toContain("expires in 1 hour");
    expect(message.text).toContain("no action is needed");
  });
});
