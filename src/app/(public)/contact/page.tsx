import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { submitContactForm } from "./actions";

const REASON_LABELS: Record<string, string> = {
  demo: "Request a demo",
  general: "General inquiry",
  support: "Existing customer support",
  other: "Something else",
};

const ERROR_MESSAGES: Record<string, string> = {
  "missing-fields": "Please fill in your name, company, and email.",
  "send-failed": "We couldn't send your message just now. Please try again shortly.",
};

export default async function ContactPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string }>;
}) {
  const { sent, error } = await searchParams;

  return (
    <section className="mx-auto max-w-2xl px-6 py-24">
      <div className="mb-10 space-y-3 text-center">
        <p className="text-sm font-medium text-muted-foreground">Contact</p>
        <h1 className="text-4xl font-semibold tracking-tight">Talk to us</h1>
        <p className="text-lg text-muted-foreground">
          Tell us about your organization and what you&apos;re looking to run on Rock Frost Business Suite.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Get in touch</CardTitle>
          <CardDescription>We typically respond within one business day.</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="mb-4 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
              Thanks — your message is on its way to us. We&apos;ll be in touch soon.
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
            <div className="space-y-2">
              <Label htmlFor="reason">What can we help with?</Label>
              <Select name="reason" defaultValue="demo" items={REASON_LABELS}>
                <SelectTrigger id="reason" className="w-full">
                  <SelectValue placeholder="Select a reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="demo">Request a demo</SelectItem>
                  <SelectItem value="general">General inquiry</SelectItem>
                  <SelectItem value="support">Existing customer support</SelectItem>
                  <SelectItem value="other">Something else</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">Message</Label>
              <Textarea id="message" name="message" rows={4} placeholder="Tell us a bit about your organization and what you&apos;re looking for." />
            </div>
            <Button type="submit" className="w-full">
              Send message
            </Button>
          </form>
        </CardContent>
      </Card>
    </section>
  );
}
