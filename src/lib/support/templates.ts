export interface SupportMessageTemplate {
  label: string;
  content: string;
}

/** Optional quick-start messages a tenant can pick and edit before sending — never sent as-is without the user choosing them. */
export const TENANT_SUPPORT_TEMPLATES: SupportMessageTemplate[] = [
  { label: "Billing question", content: "Hi, I have a question about a recent invoice or charge on our account." },
  { label: "Technical issue", content: "Hi, we're running into a technical issue and could use some help." },
  { label: "Feature request", content: "Hi, we'd like to request a new feature or improvement." },
  { label: "Account or access help", content: "Hi, we need help with account access or permissions." },
];

/** Optional quick-reply starters for platform operators — never sent as-is without the operator choosing them. */
export const PLATFORM_SUPPORT_TEMPLATES: SupportMessageTemplate[] = [
  { label: "Acknowledge", content: "Thanks for reaching out — we're looking into this now and will follow up shortly." },
  { label: "Need more info", content: "Could you share a bit more detail (e.g. steps to reproduce or a screenshot) so we can help faster?" },
  { label: "Resolved", content: "This should be resolved now — please let us know if you're still seeing the issue." },
  { label: "Following up", content: "Just following up on this — let us know if you still need anything." },
];
