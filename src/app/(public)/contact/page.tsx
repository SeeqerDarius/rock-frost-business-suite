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

const REASON_LABELS: Record<string, string> = {
  demo: "Request a demo",
  general: "General inquiry",
  support: "Existing customer support",
  other: "Something else",
};

/** UI shell only — form submission/email delivery is not wired up in this phase. */
export default function ContactPage() {
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
          <form className="space-y-4">
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
