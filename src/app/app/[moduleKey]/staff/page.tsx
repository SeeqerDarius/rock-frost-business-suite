import { notFound } from "next/navigation";
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
import { hasPermission } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { getModuleTeamConfig } from "@/modules/staff/module-team-config";
import { addModuleStaffAction, updateModuleStaffAction } from "./actions";

const MESSAGES: Record<string, string> = { forbidden: "Your role cannot manage this module's team.", invalid: "Enter a valid name, email, role, and status.", "invalid-role": "Choose a role for this module.", "invalid-user": "That account cannot be added to this workspace.", "already-active": "That person is already an active member. Change their role from Administration if needed.", "seat-limit": "No subscribed staff seat is available for this role.", "delivery-failed": "The staff record was created, but the invitation email could not be delivered. Use Administration to resend it.", "not-found": "That staff record could not be updated." };

export default async function ModuleStaffPage({ params, searchParams }: { params: Promise<{ moduleKey: string }>; searchParams: Promise<{ invited?: string; saved?: string; error?: string }> }) {
  const [{ moduleKey }, query] = await Promise.all([params, searchParams]);
  const config = getModuleTeamConfig(moduleKey);
  if (!config) notFound();
  const tenant = await requireModuleAccess(config.key);
  const canManage = hasPermission(tenant, config.managePermission);
  const [members, roles] = await Promise.all([
    db.organizationMember.findMany({ where: { organizationId: tenant.organizationId, role: { name: { in: [...config.roleNames] } }, status: { not: "REMOVED" } }, include: { user: true, role: true }, orderBy: { user: { name: "asc" } } }),
    db.role.findMany({ where: { name: { in: [...config.roleNames] }, OR: [{ organizationId: tenant.organizationId }, { isSystem: true }] }, orderBy: { name: "asc" } }),
  ]);

  return <div className="space-y-6">
    <PageHeader title={`${config.label} team`} description={`Invite staff, assign ${config.label} roles, and manage module access from one place.`} />
    {query.invited ? <p className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-700">Invitation sent. The staff member can activate their account from the emailed link.</p> : null}
    {query.saved ? <p className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-700">Staff role and access status updated.</p> : null}
    {query.error && MESSAGES[query.error] ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{MESSAGES[query.error]}</p> : null}
    {!canManage ? <EmptyState icon={UsersRound} title="Read-only team directory" description={`You can see the ${config.label} team, but your role cannot invite staff or change their access.`} /> : null}
    <Card><CardHeader><CardTitle>Team directory</CardTitle><CardDescription>{members.length} staff record{members.length === 1 ? "" : "s"} for this module.</CardDescription></CardHeader><CardContent>
      {members.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No staff have been added to this module yet.</p> : <Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead>{canManage ? <TableHead>Manage</TableHead> : null}</TableRow></TableHeader><TableBody>{members.map((member) => <TableRow key={member.id}><TableCell><p className="font-medium">{member.user.name ?? "Unnamed staff"}</p><p className="text-xs text-muted-foreground">{member.user.email}</p></TableCell><TableCell>{member.role?.name ?? "No role"}</TableCell><TableCell><Badge variant={member.status === "ACTIVE" ? "default" : "outline"}>{member.status}</Badge></TableCell>{canManage ? <TableCell><form action={updateModuleStaffAction} className="flex flex-wrap gap-2"><input type="hidden" name="moduleKey" value={config.key} /><input type="hidden" name="membershipId" value={member.id} /><select aria-label="Staff role" name="roleId" defaultValue={member.roleId ?? ""} className="h-8 rounded-lg border bg-background px-2 text-sm">{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select><select aria-label="Access status" name="status" defaultValue={member.status === "SUSPENDED" ? "SUSPENDED" : "ACTIVE"} className="h-8 rounded-lg border bg-background px-2 text-sm"><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option></select><Button type="submit" size="sm" variant="outline" disabled={member.userId === tenant.userId}>Save</Button></form></TableCell> : null}</TableRow>)}</TableBody></Table>}
    </CardContent></Card>
    {canManage ? <Card><CardHeader><CardTitle className="flex items-center gap-2"><UserPlus className="size-5" />Add staff member</CardTitle><CardDescription>Send one invitation with the correct module role already assigned. HR will remain the central employee record.</CardDescription></CardHeader><CardContent><form action={addModuleStaffAction} className="space-y-4"><input type="hidden" name="moduleKey" value={config.key} /><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="team-name">Full name</Label><Input id="team-name" name="name" required /></div><div className="space-y-2"><Label htmlFor="team-email">Email</Label><Input id="team-email" name="email" type="email" required /></div></div><div className="space-y-2"><Label htmlFor="team-role">{config.label} role</Label><select id="team-role" name="roleId" required className="h-9 w-full rounded-lg border bg-background px-3 text-sm"><option value="">Select a role</option>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></div><Button type="submit">Send staff invitation</Button></form></CardContent></Card> : null}
  </div>;
}
