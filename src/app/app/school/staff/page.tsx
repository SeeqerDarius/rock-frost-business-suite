import { UserPlus, UsersRound } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/feedback/empty-state";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { addSchoolStaffAction, updateSchoolStaffAction, resendSchoolStaffInvitationAction, revokeSchoolStaffInvitationAction } from "./actions";
import { SCHOOL_STAFF_ROLE_NAMES } from "@/modules/school/staff-roles";

const MESSAGES: Record<string, string> = { forbidden: "Your role cannot manage school staff.", invalid: "Enter a valid name, email, role, and status.", "invalid-role": "Choose a School role that includes School access.", "invalid-user": "That account cannot be added to this workspace.", "already-active": "That person is already an active member.", "seat-limit": "No subscribed School staff seat is available for this role.", "delivery-failed": "The invitation email could not be delivered. Check the address and try resending.", "not-found": "That staff record could not be found.", "resend-unavailable": "This invitation cannot be resent yet. It may have been accepted, revoked, or resent less than a minute ago.", "revoke-unavailable": "This invitation is no longer pending and cannot be revoked." };

export default async function SchoolStaffPage({ searchParams }: { searchParams: Promise<{ invited?: string; saved?: string; error?: string }> }) {
  const [tenant, query] = await Promise.all([requireModuleAccess("school"), searchParams]);
  const canManage = hasPermission(tenant, PERMISSIONS.SCHOOL_STAFF_MANAGE);
  const [members, roles] = await Promise.all([
    db.organizationMember.findMany({ where: { organizationId: tenant.organizationId, role: { name: { in: [...SCHOOL_STAFF_ROLE_NAMES] } }, status: { not: "REMOVED" } }, include: { user: true, role: true, invitation: { select: { status: true, lastDeliveryFailed: true, expiresAt: true } } }, orderBy: { user: { name: "asc" } } }),
    db.role.findMany({ where: { name: { in: [...SCHOOL_STAFF_ROLE_NAMES] }, OR: [{ organizationId: tenant.organizationId }, { isSystem: true }], rolePermissions: { some: { permission: { key: { startsWith: "school." } } } } }, orderBy: { name: "asc" } }),
  ]);
  const assignments = await db.schoolClassTeacher.findMany({ where: { organizationId: tenant.organizationId }, include: { class: true } });
  const classesByUser = new Map<string, string[]>();
  for (const assignment of assignments) classesByUser.set(assignment.userId, [...(classesByUser.get(assignment.userId) ?? []), assignment.class.name]);
  const statusCounts: Record<string, number> = {};
  for (const member of members) statusCounts[member.status] = (statusCounts[member.status] ?? 0) + 1;

  return <div className="space-y-6">
    <PageHeader title="School staff" description="Invite teachers and non-teaching staff, assign School roles, and manage their access." />
    {query.invited ? <p role="status" className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-700">Invitation email sent. The staff member can activate access from the secure link.</p> : null}
    {query.saved ? <p role="status" className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-700">Staff access was updated.</p> : null}
    {query.error && MESSAGES[query.error] ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{MESSAGES[query.error]}</p> : null}
    {!canManage ? <EmptyState icon={UsersRound} title="Read-only staff directory" description="You can see School staff, but only a School Administrator can invite staff or change roles and access." /> : null}
    <div className="grid gap-3 sm:grid-cols-3" aria-label="Staff access summary">
      {[{ label: "Active", value: statusCounts.ACTIVE ?? 0 }, { label: "Invitations pending", value: statusCounts.INVITED ?? 0 }, { label: "Suspended", value: statusCounts.SUSPENDED ?? 0 }].map((item) => <Card key={item.label}><CardContent className="flex items-center justify-between p-4"><span className="text-sm text-muted-foreground">{item.label}</span><span className="text-xl font-semibold tabular-nums">{item.value}</span></CardContent></Card>)}
    </div>
    <Card><CardHeader><CardTitle>Staff directory</CardTitle><CardDescription>{members.length} teacher and non-teaching staff record{members.length === 1 ? "" : "s"}.</CardDescription></CardHeader><CardContent>
      {members.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No School staff have been added yet. Add a teacher or staff member below to get started.</p> : <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead className="hidden md:table-cell">Assigned classes</TableHead><TableHead>Status</TableHead>{canManage ? <TableHead>Manage</TableHead> : null}</TableRow></TableHeader><TableBody>{members.map((member) => <TableRow key={member.id}><TableCell><p className="font-medium">{member.user.name ?? "Unnamed staff"}</p><p className="text-xs text-muted-foreground">{member.user.email}</p></TableCell><TableCell>{member.role?.name ?? "No role"}</TableCell><TableCell className="hidden md:table-cell text-muted-foreground">{classesByUser.get(member.userId)?.join(", ") ?? "None"}</TableCell><TableCell><Badge variant={member.status === "ACTIVE" ? "default" : "outline"}>{member.status === "INVITED" ? "Invitation pending" : member.status === "SUSPENDED" ? "Suspended" : "Active"}</Badge>{member.status === "INVITED" && member.invitation?.lastDeliveryFailed ? <p className="mt-1 text-xs text-destructive">Email delivery failed</p> : null}{member.status === "INVITED" && member.invitation?.expiresAt ? <p className="mt-1 text-xs text-muted-foreground">Expires {member.invitation.expiresAt.toLocaleDateString()}</p> : null}</TableCell>{canManage ? <TableCell>{member.status === "INVITED" ? <div className="flex flex-wrap gap-2"><form action={resendSchoolStaffInvitationAction}><input type="hidden" name="membershipId" value={member.id} /><Button type="submit" size="sm" variant="outline">Resend invite</Button></form><form action={revokeSchoolStaffInvitationAction}><input type="hidden" name="membershipId" value={member.id} /><Button type="submit" size="sm" variant="ghost" className="text-destructive">Revoke</Button></form></div> : <form action={updateSchoolStaffAction} className="flex flex-wrap gap-2"><input type="hidden" name="membershipId" value={member.id} /><select aria-label={`Role for ${member.user.name ?? member.user.email}`} name="roleId" defaultValue={member.roleId ?? ""} className="h-9 min-w-36 rounded-lg border bg-background px-2 text-sm">{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select><select aria-label={`Access status for ${member.user.name ?? member.user.email}`} name="status" defaultValue={member.status} className="h-9 rounded-lg border bg-background px-2 text-sm"><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option></select><Button type="submit" size="sm" variant="outline" disabled={member.userId === tenant.userId}>Save</Button></form>}</TableCell> : null}</TableRow>)}</TableBody></Table>}
    </CardContent></Card>
    {canManage ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><UserPlus className="size-5" />Add staff member</CardTitle><CardDescription>Send a secure, single-use email invitation. The selected role sets their School permissions.</CardDescription></CardHeader><CardContent><form action={addSchoolStaffAction} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="staff-name">Full name</Label><Input id="staff-name" name="name" autoComplete="name" required /></div><div className="space-y-2"><Label htmlFor="staff-email">Work email</Label><Input id="staff-email" name="email" type="email" autoComplete="email" required /><p className="text-xs text-muted-foreground">The invitation will be sent to this address.</p></div></div><div className="space-y-2"><Label htmlFor="staff-role">School role</Label><select id="staff-role" name="roleId" required className="h-10 w-full rounded-lg border bg-background px-3 text-sm"><option value="">Select a role</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select><p className="text-xs text-muted-foreground">You can change their role or suspend access later.</p></div><Button type="submit">Send staff invitation</Button></form></CardContent></Card> : null}
  </div>;
}
