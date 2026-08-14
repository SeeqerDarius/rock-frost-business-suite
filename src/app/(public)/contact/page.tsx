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
  const initialIntent = intent === "module" ? "MODULE" : intent === "demo" ? "DEMO" : "GENERAL";
  const selectedModule = catalogueModuleRegistry.find((item) => item.key === moduleCode);

  return (
    <>
      <PublicHero centered eyebrow="Start a conversation" title="Tell us what you need technology to accomplish." description="Share your organization, operational challenge, or product idea. We will help define the right platform, website, integration, or bespoke solution." />
      <section className="mx-auto max-w-2xl px-6 py-20"><Card className="public-panel">
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
            <TurnstileWidget action="contact" />
            <Button type="submit" className="w-full">
              Send message
            </Button>
          </form>
        </CardContent>
      </Card></section>
    </>
  );
}
