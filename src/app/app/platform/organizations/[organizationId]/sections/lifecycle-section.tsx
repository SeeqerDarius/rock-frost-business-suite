import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SectionCard } from "@/components/school/section-card";
import {
  permanentlyDeleteOrganization,
  restoreOrganization,
  scheduleOrganizationDeletion,
  updateOrganizationStatus,
} from "../../actions";
import type { OrganizationDetail } from "./data";

const STATUS_EFFECT: Record<string, string> = {
  TRIAL: "Full access while the trial window lasts.",
  ACTIVE: "Normal paid access.",
  SUSPENDED: "Nobody in this organization can sign in. Their data is untouched.",
  CANCELLED: "Access ends and the organization is treated as churned.",
};

/**
 * Account state and deletion together, because they are the same decision at
 * two depths and both cut a live customer off. Keeping them in one section
 * the operator has to navigate to, rather than at the bottom of every scroll,
 * means nobody reaches them while looking for a phone number.
 */
export function LifecycleSection({
  organization,
  deletionReady,
}: {
  organization: OrganizationDetail;
  deletionReady: boolean;
}) {
  return (
    <div className="space-y-6">
      <SectionCard
        title="Account state"
        description="Suspended and cancelled organizations cannot resolve an active tenant session, so every one of their users is locked out immediately."
      >
        {organization.deletionScheduledFor ? (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Account state is locked while deletion is scheduled</AlertTitle>
            <AlertDescription>Cancel the scheduled deletion below before changing state.</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-2">
          {(["TRIAL", "ACTIVE", "SUSPENDED", "CANCELLED"] as const).map((status) => {
            const current = organization.status === status;
            return (
              <form key={status} action={updateOrganizationStatus} className="rounded-lg border p-3">
                <input type="hidden" name="organizationId" value={organization.id} />
                <input type="hidden" name="status" value={status} />
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{status}</p>
                    <p className="text-xs text-muted-foreground">{STATUS_EFFECT[status]}</p>
                  </div>
                  <Button
                    type="submit"
                    size="sm"
                    variant={current ? "default" : "outline"}
                    disabled={current || Boolean(organization.deletionScheduledFor)}
                  >
                    {current ? "Current" : "Switch"}
                  </Button>
                </div>
              </form>
            );
          })}
        </div>
      </SectionCard>

      <SectionCard
        className="border-destructive/40"
        title="Deletion"
        description="Deletion is delayed for 30 days and requires your tenant code and password. After the recovery period it cascades through every record this organization owns."
      >
        <div className="space-y-5">
          {organization.deletionScheduledFor ? (
            <>
              <Alert variant="destructive">
                <AlertTitle>Deletion scheduled for {organization.deletionScheduledFor.toLocaleString()}</AlertTitle>
                <AlertDescription>
                  Tenant access is cancelled. Restore the organization before this date to retain it.
                </AlertDescription>
              </Alert>
              <form action={restoreOrganization}>
                <input type="hidden" name="organizationId" value={organization.id} />
                <Button type="submit" variant="outline">
                  Cancel deletion and restore
                </Button>
              </form>
              <DestructiveConfirmation
                organizationId={organization.id}
                tenantCode={organization.tenantCode}
                action={permanentlyDeleteOrganization}
                label="Permanently delete organization"
                disabled={!deletionReady}
                help={
                  deletionReady
                    ? "This permanently cascades through tenant-owned records and cannot be undone."
                    : "Available only after the recovery period expires."
                }
              />
            </>
          ) : (
            <DestructiveConfirmation
              organizationId={organization.id}
              tenantCode={organization.tenantCode}
              action={scheduleOrganizationDeletion}
              label="Schedule deletion"
              help="Cancels access immediately and schedules permanent deletion after 30 days."
            />
          )}
        </div>
      </SectionCard>
    </div>
  );
}

function DestructiveConfirmation({
  organizationId,
  tenantCode,
  action,
  label,
  help,
  disabled = false,
}: {
  organizationId: string;
  tenantCode: string;
  action: (formData: FormData) => Promise<void>;
  label: string;
  help: string;
  disabled?: boolean;
}) {
  const fieldPrefix = `${organizationId}-${label.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <form action={action} className="max-w-xl space-y-3 rounded-md border border-destructive/30 p-4">
      <input type="hidden" name="organizationId" value={organizationId} />
      <p className="text-sm text-muted-foreground">{help}</p>
      <div className="space-y-2">
        <Label htmlFor={`${fieldPrefix}-code`}>
          Type tenant code: <span className="font-mono">{tenantCode}</span>
        </Label>
        <Input id={`${fieldPrefix}-code`} name="confirmTenantCode" required autoComplete="off" />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${fieldPrefix}-password`}>Your current password</Label>
        <Input id={`${fieldPrefix}-password`} name="confirmPassword" type="password" required autoComplete="current-password" />
      </div>
      <Button type="submit" variant="destructive" disabled={disabled}>
        {label}
      </Button>
    </form>
  );
}
