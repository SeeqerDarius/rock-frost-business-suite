import { UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { SectionCard } from "@/components/school/section-card";
import { resendOrganizationInvitation } from "../../actions";
import type { OrganizationDetail } from "./data";

const STATUS_TONE: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  ACTIVE: "secondary",
  INVITED: "outline",
  SUSPENDED: "destructive",
};

/**
 * Memberships are grouped by state rather than listed in one flat creation
 * order: a pending invitation is the only row here with an action attached,
 * and it used to be buried among however many active members the tenant has.
 */
export function MembersSection({ organization }: { organization: OrganizationDetail }) {
  const invited = organization.members.filter((member) => member.status === "INVITED");
  const settled = organization.members.filter((member) => member.status !== "INVITED");

  return (
    <div className="space-y-6">
      {invited.length > 0 ? (
        <SectionCard
          title="Pending invitations"
          description="These people were invited but have not signed in yet. Resending issues a fresh seven-day link."
        >
          <div className="space-y-2">
            {invited.map((member) => (
              <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{member.user.name || member.user.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {member.user.email} · {member.role?.name ?? "No role"} · invited {member.createdAt.toLocaleDateString()}
                  </p>
                </div>
                <form action={resendOrganizationInvitation}>
                  <input type="hidden" name="organizationId" value={organization.id} />
                  <input type="hidden" name="membershipId" value={member.id} />
                  <Button type="submit" size="sm" variant="outline">
                    Resend invitation
                  </Button>
                </form>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Members"
        description="Organization memberships and the tenant role each one is assigned. Roles themselves are managed by the organization's own Owner."
      >
        {settled.length === 0 ? (
          <EmptyState
            icon={UsersRound}
            title="No members have signed in yet"
            description="Once an invited person accepts, they appear here with their assigned role and branch."
          />
        ) : (
          <div className="space-y-2">
            {settled.map((member) => (
              <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{member.user.name || member.user.email}</p>
                  <p className="text-xs text-muted-foreground">
                    {member.user.email} · {member.role?.name ?? "No role"} · {member.branch?.name ?? "All branches"}
                  </p>
                </div>
                <Badge variant={STATUS_TONE[member.status] ?? "outline"}>{member.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
