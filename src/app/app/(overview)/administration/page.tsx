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
import { isRoleAssignableToOrganization, resolveAssignableModuleKeys, roleDisplayName } from "@/lib/administration-roles";
import { changeMemberRole, deactivateMember, inviteMember, reactivateMember, removeMember, resendMemberInvitation, revokeMemberInvitation } from "./actions";
import { getOrganizationSeatUsage } from "@/platform/subscriptions/seats";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to invite members.",
  "missing-fields": "Please fill in the member's name, email, and role.",
  "invalid-role": "That role can't be assigned from here.",
  "delivery-failed": "The invitation was created, but the email failed to send. Use Resend to try again, or share the link manually.",
  "not-found": "That member could not be found.",
  "resend-failed": "That invitation can no longer be resent or revoked.",
  "self-remove": "You cannot remove your own organization access.",
  "self-deactivate": "You cannot deactivate your own organization access.",
  "last-owner": "The last active Organization Owner cannot be removed.",
  "owner-protected": "Only an Organization Owner can grant, deactivate, or remove the Organization Owner role.",
  "platform-owner": "A platform owner cannot be added to a tenant organization. Use a separate tenant-user email.",
  "seat-limit": "This role would exceed the subscribed user seats for one or more modules. Remove an unused member or ask Rock Frost to increase the subscription seats.",
};

export default async function AdministrationPage({
  searchParams,
}: {
  searchParams: Promise<{ invited?: string; revoked?: string; removed?: string; roleChanged?: string; deactivated?: string; reactivated?: string; error?: string }>;
}) {
  const { invited, revoked, removed, roleChanged, deactivated, reactivated, error } = await searchParams;
  const tenant = await requireCurrentTenant();

  const canManageSettings = hasPermission(tenant, PERMISSIONS.ORG_SETTINGS_MANAGE);
  const canManageMembers = canManageSettings || hasPermission(tenant, PERMISSIONS.ORG_MEMBERS_MANAGE);
  if (!canManageMembers) {
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

  const [members, roles, assignableModuleKeys, seatUsage] = await Promise.all([
    db.organizationMember.findMany({
      where: { organizationId: tenant.organizationId },
      include: { user: true, role: true, invitation: true },
      orderBy: { createdAt: "asc" },
    }),
    db.role.findMany({
      where: {
        OR: [{ organizationId: tenant.organizationId }, { isSystem: true }],
        name: { not: "Super Admin" },
      },
      include: { rolePermissions: { include: { permission: true } } },
      orderBy: { name: "asc" },
    }),
    resolveAssignableModuleKeys(tenant.organizationId, tenant.enabledModuleKeys),
    getOrganizationSeatUsage(tenant.organizationId),
  ]);
  const assignableRoles = roles
    .filter((role) => isRoleAssignableToOrganization(role, tenant.organizationId, assignableModuleKeys))
    // Granting the Organization Owner role is itself an owner-only power -
    // an Organization Admin (org.members.manage without org.settings.manage)
    // can invite and manage members, but never hand out ownership itself.
    // The Server Actions independently re-enforce this; filtering it out of
    // the option list here just keeps the UI honest about what will happen.
    .filter((role) => role.name !== "Organization Owner" || canManageSettings);

  const canViewAuditLog = hasPermission(tenant, PERMISSIONS.AUDIT_VIEW);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <PageHeader title="Administration" description="Users, roles, permissions, and audit logs for your organization." />
        <div className="flex gap-2">
          {canManageSettings ? (
            <Button size="sm" variant="outline" nativeButton={false} render={<Link href="/app/organization/settings" />}><Settings />Workspace settings</Button>
          ) : null}
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
      {roleChanged ? <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">Member role updated.</div> : null}
      {deactivated ? <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">Member deactivated and their module seats were released.</div> : null}
      {reactivated ? <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">Member reactivated.</div> : null}
      {error && ERROR_MESSAGES[error] ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {ERROR_MESSAGES[error]}
        </div>
      ) : null}

      {seatUsage.length ? <Card><CardHeader><CardTitle>Module user seats</CardTitle><CardDescription>Active members and pending invitations count against every module their role can access. Deactivated members release their seats immediately.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{seatUsage.map((usage) => { const remaining = usage.limit == null ? null : Math.max(usage.limit - usage.used, 0); return <div key={usage.moduleId} className="rounded-lg border p-3"><div className="flex items-center justify-between gap-2"><span className="font-medium">{usage.moduleName}</span><Badge variant={usage.limit != null && usage.used >= usage.limit ? "destructive" : "outline"}>{usage.limit == null ? `${usage.used} used · Unlimited` : `${usage.used} of ${usage.limit}`}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{remaining == null ? "Unlimited seats available" : `${remaining} seat${remaining === 1 ? "" : "s"} remaining`}</p></div>; })}</CardContent></Card> : null}

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
                // A member can hold a role that's no longer in `assignableRoles`
                // (e.g. the org's module subscription changed since it was
                // granted) - without it in the option list, the Select has no
                // label to show for the current value and falls back to
                // rendering the raw role id. Include it so the dropdown always
                // shows a real name; changeMemberRole still refuses to grant
                // this exact same role to a different member from here.
                const rowRoles = member.role && !assignableRoles.some((role) => role.id === member.role!.id)
                  ? [...assignableRoles, member.role]
                  : assignableRoles;

                return (
                  <TableRow key={member.id}>
                    <TableCell className="font-medium">{member.user.name ?? "-"}</TableCell>
                    <TableCell className="text-muted-foreground">{member.user.email}</TableCell>
                    <TableCell>
                      {member.status !== "REMOVED" ? (
                        <form action={changeMemberRole} className="flex min-w-52 items-center gap-2">
                          <input type="hidden" name="membershipId" value={member.id} />
                          <Select name="roleId" defaultValue={member.roleId ?? undefined} items={Object.fromEntries(rowRoles.map((role) => [role.id, roleDisplayName(role.name)]))}>
                            <SelectTrigger className="h-8 min-w-36"><SelectValue placeholder="Select role" /></SelectTrigger>
                            <SelectContent align="start" alignItemWithTrigger={false} className="max-h-72">
                              {rowRoles.map((role) => <SelectItem key={role.id} value={role.id}>{roleDisplayName(role.name)}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Button type="submit" size="sm" variant="outline">Save</Button>
                        </form>
                      ) : member.role ? roleDisplayName(member.role.name) : "-"}
                    </TableCell>
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
                        <div className="flex justify-end gap-1">
                          {member.status === "ACTIVE" ? <form action={deactivateMember}><input type="hidden" name="membershipId" value={member.id} /><Button type="submit" size="sm" variant="outline">Deactivate</Button></form> : null}
                          {member.status === "SUSPENDED" ? <form action={reactivateMember}><input type="hidden" name="membershipId" value={member.id} /><Button type="submit" size="sm" variant="outline">Reactivate</Button></form> : null}
                          <form action={removeMember}>
                            <input type="hidden" name="membershipId" value={member.id} />
                            <Button type="submit" size="sm" variant="ghost">Remove</Button>
                          </form>
                        </div>
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
              <Select name="roleId" items={Object.fromEntries(assignableRoles.map((r) => [r.id, roleDisplayName(r.name)]))}>
                <SelectTrigger id="roleId" className="w-full">
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent align="start" alignItemWithTrigger={false} className="max-h-72">
                  {assignableRoles.map((role) => (
                    <SelectItem key={role.id} value={role.id}>
                      {roleDisplayName(role.name)}
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
