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
import { addSchoolStaffAction, updateSchoolStaffAction } from "./actions";
import { SCHOOL_STAFF_ROLE_NAMES } from "@/modules/school/staff-roles";

const MESSAGES: Record<string, string> = { forbidden: "Your role cannot manage school staff.", invalid: "Enter a valid name, email, role, and status.", "invalid-role": "Choose a School role.", "invalid-user": "That account cannot be added to this workspace.", "already-active": "That person is already an active member.", "seat-limit": "No subscribed School staff seat is available for this role.", "delivery-failed": "The staff record was created, but the invitation email could not be delivered. Use Administration to resend it.", "not-found": "That staff record could not be updated." };

export default async function SchoolStaffPage({ searchParams }: { searchParams: Promise<{ invited?: string; saved?: string; error?: string }> }) {
  const [tenant, query] = await Promise.all([requireModuleAccess("school"), searchParams]);
  const canManage = hasPermission(tenant, PERMISSIONS.SCHOOL_STAFF_MANAGE);
  const [members, roles] = await Promise.all([
    db.organizationMember.findMany({ where: { organizationId: tenant.organizationId, role: { name: { in: [...SCHOOL_STAFF_ROLE_NAMES] } }, status: { not: "REMOVED" } }, include: { user: true, role: true }, orderBy: { user: { name: "asc" } } }),
    db.role.findMany({ where: { name: { in: [...SCHOOL_STAFF_ROLE_NAMES] }, OR: [{ organizationId: tenant.organizationId }, { isSystem: true }] }, orderBy: { name: "asc" } }),
  ]);
  const assignments = await db.schoolClassTeacher.findMany({ where: { organizationId: tenant.organizationId }, include: { class: true } });
  const classesByUser = new Map<string, string[]>();
  for (const assignment of assignments) classesByUser.set(assignment.userId, [...(classesByUser.get(assignment.userId) ?? []), assignment.class.name]);

  return <div className="space-y-6">
    <PageHeader title="School staff" description="Invite teachers and non-teaching staff, assign School roles, and manage their access." />
    {query.invited ? <p className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-700">Invitation sent. The staff member can use the emailed link to activate their account.</p> : null}
    {query.saved ? <p className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-700">Staff role and access status updated.</p> : null}
    {query.error && MESSAGES[query.error] ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{MESSAGES[query.error]}</p> : null}
    {!canManage ? <EmptyState icon={UsersRound} title="Read-only staff directory" description="You can see School staff, but only a School Administrator can invite staff or change roles and access." /> : null}
    <Card><CardHeader><CardTitle>Staff directory</CardTitle><CardDescription>{members.length} teacher and non-teaching staff record{members.length === 1 ? "" : "s"}.</CardDescription></CardHeader><CardContent>
      {members.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No School staff have been added yet.</p> : <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead className="hidden md:table-cell">Assigned classes</TableHead><TableHead>Status</TableHead>{canManage ? <TableHead>Manage</TableHead> : null}</TableRow></TableHeader><TableBody>{members.map((member) => <TableRow key={member.id}><TableCell><p className="font-medium">{member.user.name ?? "Unnamed staff"}</p><p className="text-xs text-muted-foreground">{member.user.email}</p></TableCell><TableCell>{member.role?.name ?? "No role"}</TableCell><TableCell className="hidden md:table-cell text-muted-foreground">{classesByUser.get(member.userId)?.join(", ") ?? "None"}</TableCell><TableCell><Badge variant={member.status === "ACTIVE" ? "default" : "outline"}>{member.status}</Badge></TableCell>{canManage ? <TableCell><form action={updateSchoolStaffAction} className="flex flex-wrap gap-2"><input type="hidden" name="membershipId" value={member.id} /><select name="roleId" defaultValue={member.roleId ?? ""} className="h-8 rounded-lg border bg-background px-2 text-sm">{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select><select name="status" defaultValue={member.status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE"} className="h-8 rounded-lg border bg-background px-2 text-sm"><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option></select><Button type="submit" size="sm" variant="outline" disabled={member.userId === tenant.userId}>Save</Button></form></TableCell> : null}</TableRow>)}</TableBody></Table>}
    </CardContent></Card>
    {canManage ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><UserPlus className="size-5" />Add staff member</CardTitle><CardDescription>They will receive an email invitation. Their School role controls what they can see and do.</CardDescription></CardHeader><CardContent><form action={addSchoolStaffAction} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="staff-name">Full name</Label><Input id="staff-name" name="name" required /></div><div className="space-y-2"><Label htmlFor="staff-email">Email</Label><Input id="staff-email" name="email" type="email" required /></div></div><div className="space-y-2"><Label htmlFor="staff-role">School role</Label><select id="staff-role" name="roleId" required className="h-9 w-full rounded-lg border bg-background px-3 text-sm"><option value="">Select a role</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></div><Button type="submit">Send staff invitation</Button></form></CardContent></Card> : null}
  </div>;
}
