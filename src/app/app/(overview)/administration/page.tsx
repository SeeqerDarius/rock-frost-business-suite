import Link from "next/link";
import { Lock, ShieldCheck, UserPlus, History, Settings } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { db } from "@/lib/db";
import { requireCurrentTenant } from "@/lib/tenant";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { inviteMember, removeMember, resendMemberInvitation, revokeMemberInvitation } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to invite members.",
  "missing-fields": "Please fill in the member's name, email, and role.",
  "invalid-role": "That role can't be assigned from here.",
  "delivery-failed": "The invitation was created, but the email failed to send. Use Resend to try again, or share the link manually.",
  "not-found": "That member could not be found.",
  "resend-failed": "That invitation can no longer be resent or revoked.",
  "self-remove": "You cannot remove your own organization access.",
  "last-owner": "The last active Organization Owner cannot be removed.",
  "platform-owner": "A platform owner cannot be added to a tenant organization. Use a separate tenant-user email.",
};

const INVITABLE_ROLE_NAMES = [
  "Organization Owner",
  "Fleet Manager",
  "Driver",
  "Mechanic",
  "Investor",
  "Hire Purchase Manager",
  "Hire Purchase Staff",
];

export default async function AdministrationPage({
  searchParams,
}: {
  searchParams: Promise<{ invited?: string; revoked?: string; removed?: string; error?: string }>;
}) {
  const { invited, revoked, removed, error } = await searchParams;
  const tenant = await requireCurrentTenant();

  if (!hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Administration" description="Users, roles, permissions, and audit logs for your organization." />
        <EmptyState
          icon={Lock}
          title="You don't have access to this page"
          description="Administration is limited to roles with organization administration permissions."
        />
      </div>
    );
  }

  const [members, roles] = await Promise.all([
    db.organizationMember.findMany({
      where: { organizationId: tenant.organizationId },
      include: { user: true, role: true, invitation: true },
      orderBy: { createdAt: "asc" },
    }),
    db.role.findMany({ where: { name: { in: INVITABLE_ROLE_NAMES } }, orderBy: { name: "asc" } }),
  ]);

  const canViewAuditLog = hasPermission(tenant, PERMISSIONS.AUDIT_VIEW);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Administration" description="Users, roles, permissions, and audit logs for your organization." />
        <div className="flex gap-2">
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/app/organization/settings" />}><Settings />Workspace settings</Button>
          {canViewAuditLog ? (
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/app/administration/audit-log" />}>
              <History />Audit log
            </Button>
          ) : null}
        </div>
      </div>

      {invited ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
          Invitation sent.
        </div>
      ) : null}
      {revoked ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
          Invitation revoked.
        </div>
      ) : null}
      {removed ? <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">Member access removed.</div> : null}
      {error && ERROR_MESSAGES[error] ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {ERROR_MESSAGES[error]}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-muted-foreground" />
            <CardTitle>Members</CardTitle>
          </div>
          <CardDescription>{members.length} member{members.length === 1 ? "" : "s"} in this organization.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => {
                const invitation = member.invitation;
                const canManageInvite = member.status === "INVITED" && invitation?.status === "PENDING";

                return (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">{member.user.name ?? "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{member.user.email}</TableCell>
                    <TableCell>{member.role?.name ?? "-"}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge variant={member.status === "ACTIVE" ? "default" : "outline"}>{member.status}</Badge>
                        {invitation?.lastDeliveryFailed ? (
                          <Badge variant="destructive" className="text-[10px]">
                            Email failed
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {canManageInvite ? (
                        <div className="flex justify-end gap-1">
                          <form action={resendMemberInvitation}>
                            <input type="hidden" name="membershipId" value={member.id} />
                            <Button type="submit" size="sm" variant="ghost">
                              Resend
                            </Button>
                          </form>
                          <form action={revokeMemberInvitation}>
                            <input type="hidden" name="membershipId" value={member.id} />
                            <Button type="submit" size="sm" variant="ghost">
                              Revoke
                            </Button>
                          </form>
                        </div>
                      ) : member.status !== "REMOVED" && member.userId !== tenant.userId ? (
                        <form action={removeMember}>
                          <input type="hidden" name="membershipId" value={member.id} />
                          <Button type="submit" size="sm" variant="ghost">Remove access</Button>
                        </form>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <UserPlus className="size-5 text-muted-foreground" />
            <CardTitle>Invite a member</CardTitle>
          </div>
          <CardDescription>They&apos;ll receive an email with a link to set up their password and join.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={inviteMember} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" name="name" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" required />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="roleId">Role</Label>
              <Select name="roleId" items={Object.fromEntries(roles.map((r) => [r.id, r.name]))}>
                <SelectTrigger id="roleId" className="w-full">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {role.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit">Send invitation</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
