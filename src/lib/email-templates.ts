type TransactionalEmail = { subject: string; html: string; text: string };

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character] ?? character);
}

function layout(preview: string, heading: string, body: string, actionLabel: string, actionUrl: string, expiry: string) {
  const safeUrl = escapeHtml(actionUrl);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(preview)}</title></head><body style="margin:0;background:#f4f7fb;color:#172033;font-family:Arial,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(preview)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fb"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #dce4ef;border-radius:14px"><tr><td style="padding:30px"><p style="margin:0 0 22px;color:#1264a3;font-size:14px;font-weight:700;letter-spacing:.4px">ROCK FROST BUSINESS SUITE</p><h1 style="margin:0 0 18px;font-size:25px;line-height:1.3">${escapeHtml(heading)}</h1>${body}<p style="margin:26px 0"><a href="${safeUrl}" style="display:inline-block;background:#1264a3;color:#fff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:8px">${escapeHtml(actionLabel)}</a></p><p style="margin:0 0 8px;color:#526174;font-size:13px">${escapeHtml(expiry)}</p><p style="margin:0;color:#526174;font-size:13px;line-height:1.6">If the button does not work, copy and paste this address into your browser:<br><a href="${safeUrl}" style="color:#1264a3;word-break:break-all">${safeUrl}</a></p><hr style="border:0;border-top:1px solid #e4eaf2;margin:26px 0"><p style="margin:0;color:#6b7788;font-size:12px;line-height:1.6">This is an account-service message from Rock Frost Business Suite. We will never ask you to send your password or authenticator code by email.</p></td></tr></table></td></tr></table></body></html>`;
}

export function invitationEmail(input: { organizationName: string; roleName: string; inviteUrl: string; reminder?: boolean }): TransactionalEmail {
  const organization = escapeHtml(input.organizationName);
  const role = escapeHtml(input.roleName);
  const subject = `${input.reminder ? "Reminder: " : ""}${input.organizationName} invited you to Rock Frost Business Suite`;
  const intro = input.reminder ? "Your invitation is still available." : "An administrator created an account invitation for you.";
  return {
    subject,
    html: layout(subject, `Join ${input.organizationName}`, `<p style="margin:0 0 14px;line-height:1.7">${intro}</p><p style="margin:0;line-height:1.7">Organization: <strong>${organization}</strong><br>Access role: <strong>${role}</strong></p>`, "Review and accept invitation", input.inviteUrl, "This secure invitation expires in 7 days and can be used only once."),
    text: `${subject}\n\n${intro}\nOrganization: ${input.organizationName}\nAccess role: ${input.roleName}\n\nReview and accept the invitation:\n${input.inviteUrl}\n\nThis secure invitation expires in 7 days and can be used only once. If you were not expecting it, you can ignore this message. Rock Frost will never ask you to send your password or authenticator code by email.`,
  };
}

export function passwordResetEmail(resetUrl: string): TransactionalEmail {
  const subject = "Reset your Rock Frost Business Suite password";
  return {
    subject,
    html: layout(subject, "Reset your password", '<p style="margin:0;line-height:1.7">We received a request to reset the password for your account. If you made this request, use the secure link below.</p>', "Reset password", resetUrl, "This secure link expires in 1 hour and can be used only once. If you did not request a reset, no action is needed."),
    text: `${subject}\n\nWe received a request to reset the password for your account.\n\nReset your password:\n${resetUrl}\n\nThis secure link expires in 1 hour and can be used only once. If you did not request a reset, no action is needed. Rock Frost will never ask you to send your password or authenticator code by email.`,
  };
}
