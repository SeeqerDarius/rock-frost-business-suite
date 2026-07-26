import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requirePlatformOperator } from "@/lib/auth/module-access";
import { createOrganization } from "../actions";
import { db } from "@/lib/db";

const ERRORS: Record<string, string> = {
  invalid: "Check all required fields and use a lowercase tenant code such as acme-ghana.",
  "tenant-code": "That tenant code is already in use.",
  "owner-role": "The Organization Owner system role is missing. Run the platform seed.",
  "platform-owner": "The platform owner cannot also be a tenant owner. Use a separate customer email address.",
  "create-failed": "The organization could not be created. The owner may already belong to it.",
};

export default async function NewOrganizationPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; inquiry?: string }>;
}) {
  await requirePlatformOperator();
  const { error, inquiry } = await searchParams;
  const submission = inquiry ? await db.contactSubmission.findFirst({ where: { id: inquiry, status: "NEW" }, include: { module: true } }) : null;
  return (
    <div className="space-y-6">
      <PageHeader title="New organization" description="Create a trial tenant and invite its first Organization Owner." />
      {error && ERRORS[error] ? (
        <Alert variant="destructive"><AlertTitle>Onboarding failed</AlertTitle><AlertDescription>{ERRORS[error]}</AlertDescription></Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Organization profile</CardTitle>
          <CardDescription>The organization starts in trial status. The owner receives a seven-day invitation.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createOrganization} className="grid gap-4 md:grid-cols-2">
            {submission ? <input type="hidden" name="contactSubmissionId" value={submission.id} /> : null}
            <Field label="Organization name" name="name" required defaultValue={submission?.company} />
            <div className="space-y-2"><Label>Tenant code</Label><Input value="Generated automatically when saved" disabled /></div>
            <Field label="Owner email" name="ownerEmail" type="email" required defaultValue={submission?.email} />
            <Field label="Billing email" name="billingEmail" type="email" defaultValue={submission?.email} />
            <Field label="Organization email" name="email" type="email" defaultValue={submission?.email} />
            <Field label="Phone" name="phone" defaultValue={submission?.phone} />
            <Field label="Industry" name="industry" defaultValue={submission?.industry} />
            <Field label="Website" name="website" />
            <Field label="Country" name="country" defaultValue={submission?.country} />
            <Field label="Region" name="region" />
            <Field label="City" name="city" />
            <Field label="Currency" name="currency" defaultValue="GHS" required />
            <Field label="Timezone" name="timezone" defaultValue="Africa/Accra" required />
            <Field label="Language" name="defaultLanguage" defaultValue="en" required />
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="address">Address</Label>
              <Textarea id="address" name="address" rows={3} />
            </div>
            <div className="flex gap-2 md:col-span-2">
              <Button type="submit">Create and invite owner</Button>
              <Button variant="outline" nativeButton={false} render={<Link href="/app/platform/organizations" />}>Cancel</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string | null;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} type={type} required={required} placeholder={placeholder} defaultValue={defaultValue ?? undefined} />
    </div>
  );
}
