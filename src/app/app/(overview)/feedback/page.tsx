import { MessageSquareHeart } from "lucide-react";
import { getCurrentTenant } from "@/lib/tenant";
import { listMyFeedback } from "@/lib/customer-feedback";
import { PageHeader } from "@/components/layout/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { submitFeedbackAction, withdrawFeedbackAction } from "./actions";
import { isPlatformOperator } from "@/lib/auth/permissions";
import { redirect } from "next/navigation";

const labels = { TESTIMONIAL: "Testimonial", SUGGESTION: "Suggestion", PROBLEM: "Problem", GENERAL: "General feedback" } as const;

export default async function FeedbackPage({ searchParams }: { searchParams: Promise<{ submitted?: string; withdrawn?: string; error?: string }> }) {
  const tenant = await getCurrentTenant();
  if (!tenant) redirect("/login");
  if (isPlatformOperator(tenant)) redirect("/app/platform/feedback");
  const [query, feedback] = await Promise.all([searchParams, listMyFeedback(tenant.organizationId, tenant.userId)]);
  return <div className="mx-auto max-w-4xl space-y-6">
    <PageHeader title="Share feedback" description="Tell Rock Frost what is working and what could be better. Feedback stays private unless you explicitly offer a testimonial for publication." />
    {query.submitted ? <Alert><AlertTitle>Thank you</AlertTitle><AlertDescription>Your feedback was submitted for review. Nothing is published automatically.</AlertDescription></Alert> : null}
    {query.withdrawn ? <Alert><AlertTitle>Consent withdrawn</AlertTitle><AlertDescription>This feedback is no longer eligible to appear publicly.</AlertDescription></Alert> : null}
    {query.error ? <Alert variant="destructive"><AlertTitle>Feedback not submitted</AlertTitle><AlertDescription>{query.error === "rate-limit" ? "Please wait 30 minutes before sending another feedback entry." : "Check the required fields and try again."}</AlertDescription></Alert> : null}
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><MessageSquareHeart className="size-5 text-primary" />Your experience matters</CardTitle><CardDescription>Problems and suggestions are always private. Only a testimonial with your publication consent can be considered for the website.</CardDescription></CardHeader>
      <CardContent><form action={submitFeedbackAction} className="grid gap-5 md:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="category">Feedback type</Label><select id="category" name="category" required className="h-10 w-full rounded-md border bg-background px-3 text-sm"><option value="GENERAL">General feedback</option><option value="SUGGESTION">Suggestion</option><option value="PROBLEM">Problem</option><option value="TESTIMONIAL">Testimonial</option></select></div>
        <div className="space-y-2"><Label htmlFor="rating">Overall rating</Label><select id="rating" name="rating" required className="h-10 w-full rounded-md border bg-background px-3 text-sm">{[5,4,3,2,1].map((rating) => <option key={rating} value={rating}>{rating} of 5</option>)}</select></div>
        <div className="space-y-2 md:col-span-2"><Label htmlFor="title">Short title</Label><Input id="title" name="title" maxLength={120} required /></div>
        <div className="space-y-2 md:col-span-2"><Label htmlFor="message">Your feedback</Label><Textarea id="message" name="message" maxLength={1200} rows={5} required /></div>
        <div className="space-y-2 md:col-span-2"><Label htmlFor="jobTitle">Job title (optional)</Label><Input id="jobTitle" name="jobTitle" maxLength={100} /></div>
        <fieldset className="space-y-3 rounded-lg border p-4 md:col-span-2"><legend className="px-1 text-sm font-medium">Optional testimonial permission</legend><p className="text-sm text-muted-foreground">These choices apply only when “Testimonial” is selected. A platform reviewer must still approve publication.</p>
          <label className="flex gap-3 text-sm"><input type="checkbox" name="consentToPublish" className="mt-1 size-4 accent-primary" />I permit Rock Frost to consider this testimonial for the public website.</label>
          <label className="flex gap-3 text-sm"><input type="checkbox" name="consentDisplayName" className="mt-1 size-4 accent-primary" />My name may be displayed.</label>
          <label className="flex gap-3 text-sm"><input type="checkbox" name="consentDisplayOrganization" className="mt-1 size-4 accent-primary" />My organization’s name may be displayed.</label>
          <label className="flex gap-3 text-sm"><input type="checkbox" name="consentDisplayLogo" className="mt-1 size-4 accent-primary" />My organization’s approved logo may be displayed.</label>
        </fieldset>
        <Button type="submit" className="md:w-fit">Submit feedback</Button>
      </form></CardContent>
    </Card>
    <section className="space-y-3"><h2 className="text-xl font-semibold">Your submissions</h2>{feedback.length === 0 ? <p className="rounded-lg border p-5 text-sm text-muted-foreground">You have not submitted feedback yet.</p> : feedback.map((item) => <Card key={item.id}><CardHeader><div className="flex flex-wrap items-center justify-between gap-2"><CardTitle className="text-base">{item.title}</CardTitle><Badge variant="outline">{item.status.replaceAll("_", " ")}</Badge></div><CardDescription>{labels[item.category]} · {item.rating}/5 · {item.createdAt.toLocaleDateString("en-GB", { dateStyle: "medium", timeZone: tenant.organization.timezone || "Africa/Accra" })}</CardDescription></CardHeader><CardContent className="space-y-3"><p className="text-sm">{item.message}</p>{item.consentToPublish && item.status !== "WITHDRAWN" ? <form action={withdrawFeedbackAction}><input type="hidden" name="feedbackId" value={item.id} /><Button size="sm" variant="outline">Withdraw publication consent</Button></form> : null}</CardContent></Card>)}</section>
  </div>;
}
