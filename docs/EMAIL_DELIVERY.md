# Transactional Email Delivery

Rock Frost sends account invitations and password resets through Resend using multipart messages: a carefully styled HTML version and a complete plain-text alternative. Templates identify the organization and assigned role, show the destination URL as a fallback, state expiration and one-time-use rules, and warn that Rock Frost never requests passwords or authenticator codes by email.

## Production sender requirements

Inbox placement cannot be guaranteed by application code. Before enabling production delivery:

1. Verify a dedicated sending subdomain such as `mail.rockfrostgroup.com` in Resend.
2. Publish every SPF and DKIM record shown by Resend, then confirm the domain reports as verified.
3. Publish DMARC for the organizational domain, initially with reporting enabled; review reports before moving to a stricter quarantine/reject policy.
4. Set `RESEND_FROM_EMAIL` to a stable, recognizable identity on that verified domain, for example `Rock Frost Business Suite <accounts@mail.rockfrostgroup.com>`.
5. Set `RESEND_REPLY_TO` to a monitored support mailbox. Do not use a personal or unrelated free-mail From address.
6. Keep invitations transactional, send only to explicitly supplied customer addresses, suppress hard bounces/complaints, and avoid repeated manual resends.

The API key and sender variables must exist in the Vercel Production environment. Preview deployments should use a separate test sender where practical. Provider delivery, bounce, complaint, and suppression events should be monitored in Resend; a successful API response means accepted for delivery, not guaranteed inbox placement.
