import { ClipboardCheck, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listReviews, listEmployees } from "@/modules/hr/service";
import { createNewReview, completeExistingReview } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage performance reviews.",
  "missing-fields": "Employee and review period are required.",
  incomplete: "A rating is required before completing a review.",
  "not-found": "That employee could not be found.",
};

const RATING_ITEMS: Record<string, string> = { "1": "1 — Needs improvement", "2": "2 — Below expectations", "3": "3 — Meets expectations", "4": "4 — Exceeds expectations", "5": "5 — Outstanding" };

export default async function HrReviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireCurrentTenant();
  const canManage = hasPermission(tenant, PERMISSIONS.HR_REVIEWS_MANAGE);
  const [reviews, employees] = await Promise.all([listReviews(tenant.organizationId), listEmployees(tenant.organizationId)]);
  const employeeItems: Record<string, string> = Object.fromEntries(employees.map((e) => [e.id, e.fullName]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Reviews" description="Performance reviews across the organization." />
        {canManage ? (
          <EntityDialog trigger={<Button size="sm"><Plus />New review</Button>} title="New performance review" action={createNewReview}>
            <div className="space-y-2">
              <Label htmlFor="employeeId">Employee</Label>
              <Select name="employeeId" items={employeeItems}>
                <SelectTrigger id="employeeId" className="w-full">
                  <SelectValue placeholder="Select an employee" />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(employeeItems).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="reviewPeriodStart">Period start</Label>
                <Input id="reviewPeriodStart" name="reviewPeriodStart" type="date" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reviewPeriodEnd">Period end</Label>
                <Input id="reviewPeriodEnd" name="reviewPeriodEnd" type="date" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="rating">Rating</Label>
              <Select name="rating" defaultValue="" items={{ "": "Not rated yet", ...RATING_ITEMS }}>
                <SelectTrigger id="rating" className="w-full">
                  <SelectValue placeholder="Not rated yet" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Not rated yet</SelectItem>
                  {Object.entries(RATING_ITEMS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="summary">Summary</Label>
              <Textarea id="summary" name="summary" rows={3} />
            </div>
          </EntityDialog>
        ) : null}
      </div>

      {saved ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
          Saved.
        </div>
      ) : null}
      {error && ERROR_MESSAGES[error] ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {ERROR_MESSAGES[error]}
        </div>
      ) : null}

      {reviews.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No reviews yet" description="Performance reviews you create will appear here." />
      ) : (
        <div className="space-y-3">
          {reviews.map((review) => (
            <div key={review.id} className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{review.employee.fullName}</p>
                  <Badge variant={review.status === "COMPLETED" ? "default" : "outline"}>{review.status}</Badge>
                  {review.rating ? <Badge variant="secondary">Rating: {review.rating}/5</Badge> : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {review.reviewPeriodStart.toLocaleDateString()} – {review.reviewPeriodEnd.toLocaleDateString()}
                  {review.reviewedBy ? ` · reviewed by ${review.reviewedBy.name ?? review.reviewedBy.email}` : ""}
                </p>
                {review.summary ? <p className="text-sm text-muted-foreground">{review.summary}</p> : null}
              </div>
              {canManage && review.status === "DRAFT" ? (
                <form action={completeExistingReview}>
                  <input type="hidden" name="id" value={review.id} />
                  <Button type="submit" size="sm" variant="ghost">Complete</Button>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
