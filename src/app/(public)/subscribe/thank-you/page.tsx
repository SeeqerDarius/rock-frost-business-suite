import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function SubscriptionThankYouPage({ searchParams }: { searchParams: Promise<{ email?: string; delivery?: string }> }) {
  const { email, delivery } = await searchParams;
  return <section className="mx-auto max-w-2xl px-6 py-20"><Card><CardHeader className="text-center"><CheckCircle2 className="mx-auto mb-3 size-10 text-emerald-600" /><CardTitle>Check your email to finish setup</CardTitle></CardHeader><CardContent className="space-y-4 text-center text-muted-foreground"><p>We prepared your organization and subscription{email ? ` for ${email}` : ""}. Use the secure invitation to set your password, then continue to Billing and pay with Paystack.</p>{delivery === "failed" ? <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-amber-700">The email provider did not confirm delivery. Contact Rock Frost support so we can resend the invitation.</p> : null}<p>Your selected module or suite activates automatically only after Paystack verifies the payment.</p><Button nativeButton={false} render={<Link href="/login" />}>Go to sign in</Button></CardContent></Card></section>;
}
