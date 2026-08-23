import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { submitContactForm } from "./actions";
import { catalogueModuleRegistry } from "@/platform/modules/registry";
import { createPublicMetadata } from "@/lib/seo";
import { PublicHero } from "@/components/marketing/public-hero";
import { TurnstileWidget } from "@/components/security/turnstile-widget";
import { isBotProtectionConfigured } from "@/lib/bot-protection";
import { createContactFormProof } from "@/lib/contact-form-protection";
import { getPublicContactDetails } from "@/lib/public-contact";
import Link from "next/link";
import { Mail, MessageCircle, Phone } from "lucide-react";

export const metadata = createPublicMetadata({
  title: "Request a Business Software Demo",
  description: "Request a demonstration, module subscription, or custom business software consultation from Rock Frost Technologies.",
  path: "/contact",
  keywords: ["business software demo Ghana", "request ERP demo", "Rock Frost contact"],
});

const ERROR_MESSAGES: Record<string, string> = {
  "missing-fields": "Please double-check your name, company, and a valid email address.",
  "send-failed": "We couldn't send your message just now. Please try again shortly.",
  "too-soon": "You've already sent a message recently. Please wait a moment before sending another.",
  "invalid-module": "Please choose an available module.",
  "bot-check": "We couldn't verify this submission. Please refresh the page and try again.",
};

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; intent?: string; module?: string }>;
}) {
  const { sent, error, intent, module: moduleCode } = await searchParams;
  const initialIntent = intent === "module" ? "MODULE" : intent === "demo" ? "DEMO" : intent === "legal" ? "LEGAL" : "GENERAL";
  const selectedModule = catalogueModuleRegistry.find((item) => item.key === moduleCode);
  const turnstileConfigured = isBotProtectionConfigured();
  const contactProof = turnstileConfigured
    ? null
    : createContactFormProof(process.env.NEXTAUTH_SECRET ?? "");
  const contact = await getPublicContactDetails();

  return (
    <>
      <PublicHero centered eyebrow="Start a conversation" title="Tell us what you need technology to accomplish." description="Share your organization, operational challenge, or product idea. We will help define the right platform, website, integration, or bespoke solution." />
      <section className="mx-auto grid max-w-6xl gap-8 px-6 py-20 lg:grid-cols-[0.75fr_1.25fr]">
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold">Quick enquiries</h2>
          <p className="text-muted-foreground">Use the details configured by the Rock Frost team, or send the secure form.</p>
          {contact.salesEmail ? <a className="flex items-center gap-3 rounded-lg border p-4 hover:border-primary" href={`mailto:${contact.salesEmail}`}><Mail className="size-5 text-primary" /><span><strong className="block">Sales</strong>{contact.salesEmail}</span></a> : null}
          {contact.supportEmail ? <a className="flex items-center gap-3 rounded-lg border p-4 hover:border-primary" href={`mailto:${contact.supportEmail}`}><MessageCircle className="size-5 text-primary" /><span><strong className="block">Support</strong>{contact.supportEmail}</span></a> : null}
          {contact.phone ? <a className="flex items-center gap-3 rounded-lg border p-4 hover:border-primary" href={`tel:${contact.phone.replace(/[^+\d]/g, "")}`}><Phone className="size-5 text-primary" /><span><strong className="block">Phone</strong>{contact.phone}</span></a> : null}
          {contact.whatsapp ? <a className="flex items-center gap-3 rounded-lg border p-4 hover:border-primary" href={`https://wa.me/${contact.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer"><MessageCircle className="size-5 text-primary" /><span><strong className="block">WhatsApp</strong>{contact.whatsapp}</span></a> : null}
          <Card><CardContent className="space-y-2 pt-6 text-sm text-muted-foreground"><p className="font-medium text-foreground">Already a customer?</p><p>Sign in to use the in-app support assistant. If a platform operator is online, the conversation goes directly to the person. Unresolved AI conversations remain available for operator follow-up.</p><Link href="/login?callbackUrl=%2Fapp%2Fsupport" className="font-medium text-primary underline underline-offset-4">Open customer support</Link></CardContent></Card>
        </div>
        <Card id="contact-form" className="public-panel scroll-mt-24">
        <CardHeader>
          <CardTitle>Get in touch</CardTitle>
          <CardDescription>We typically respond within one business day.</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
              Thanks your message is on its way to us. We&apos;ll be in touch soon.
            </div>
          ) : null}
          {error && ERROR_MESSAGES[error] ? (
            <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {ERROR_MESSAGES[error]}
            </div>
          ) : null}
          <form action={submitContactForm} className="space-y-4">
            {contactProof ? <input type="hidden" name="contactProof" value={contactProof} /> : null}
            <div className="absolute -left-[10000px] h-px w-px overflow-hidden" aria-hidden="true">
              <Label htmlFor="website">Website</Label>
              <Input id="website" name="website" tabIndex={-1} autoComplete="off" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" name="name" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Company</Label>
                <Input id="company" name="company" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Work email</Label>
              <Input id="email" name="email" type="email" placeholder="you@company.com" required />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="phone">Phone / WhatsApp number</Label>
                <Input id="phone" name="phone" type="tel" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="preferredContact">Preferred contact</Label>
                <select id="preferredContact" name="preferredContact" defaultValue="EMAIL" className="h-9 w-full rounded-md border bg-transparent px-3 text-sm">
                  <option value="EMAIL">Email</option>
                  <option value="PHONE">Phone call</option>
                  <option value="WHATSAPP">WhatsApp</option>
                </select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="intent">Request</Label>
                <select id="intent" name="intent" defaultValue={initialIntent} className="h-9 w-full rounded-md border bg-transparent px-3 text-sm">
                  <option value="DEMO">Request a demo</option>
                  <option value="MODULE">Subscribe to a module</option>
                  <option value="CUSTOM_MODULE">Request a custom module</option>
                  <option value="GENERAL">General inquiry</option>
                  <option value="SUPPORT">Existing customer support</option>
                  <option value="LEGAL">Legal or privacy inquiry</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="moduleCode">Module</Label>
                <select id="moduleCode" name="moduleCode" defaultValue={selectedModule?.key ?? ""} className="h-9 w-full rounded-md border bg-transparent px-3 text-sm">
                  <option value="">Choose a module</option>
                  {catalogueModuleRegistry.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
                </select>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2"><Label htmlFor="expectedUsers">Expected users</Label><Input id="expectedUsers" name="expectedUsers" type="number" min="1" /></div>
              <div className="space-y-2"><Label htmlFor="industry">Industry</Label><Input id="industry" name="industry" /></div>
              <div className="space-y-2"><Label htmlFor="country">Country</Label><Input id="country" name="country" /></div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">Message</Label>
              <Textarea id="message" name="message" rows={4} placeholder="Tell us a bit about your organization and what you&apos;re looking for." />
            </div>
            {turnstileConfigured ? <TurnstileWidget action="contact" /> : null}
            <Button type="submit" className="w-full">
              Send message
            </Button>
          </form>
        </CardContent>
      </Card></section>
    </>
  );
}
