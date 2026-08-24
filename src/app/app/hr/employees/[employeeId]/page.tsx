import Link from "next/link";
import { notFound } from "next/navigation";
import { Mail, Phone, Smartphone, CalendarClock, History as HistoryIcon, Network, CircleCheck, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconBadge } from "@/components/ui/icon-badge";
import { EntityDialog } from "@/components/forms/entity-dialog";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { db } from "@/lib/db";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { isRoleAssignableToOrganization, resolveAssignableModuleKeys, roleDisplayName } from "@/lib/administration-roles";
import { getEmployeeProfile, getEmployeeStatusHistory, listManagerCandidates, listPlanTemplates, listPendingPlanActivities, listEmployeeSkills, listSkillTypes } from "@/modules/hr/service";
import { upsertEmployee } from "../actions";
import { EmployeeFields } from "../employee-fields";
import { PersonAvatar } from "../person-avatar";
import { markPlanActivityDone, createUserForEmployee, saveResumeEntry, removeResumeEntry, saveEmployeeSkill, removeEmployeeSkillAction } from "./actions";
import { LaunchPlanDialog } from "./launch-plan-dialog";

const STATUS_BADGE: Record<string, "default" | "outline" | "destructive" | "secondary"> = {
  ONBOARDING: "secondary",
  ACTIVE: "default",
  ON_LEAVE: "outline",
  SUSPENDED: "destructive",
  TERMINATION_PENDING: "secondary",
  TERMINATED: "destructive",
  REINSTATED: "default",
};

const RESUME_TYPE_LABEL: Record<string, string> = { EXPERIENCE: "Experience", EDUCATION: "Education", INTERNAL: "Internal move" };

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to do that.",
  "missing-fields": "Choose a template and a target date, or a role and an employee email.",
  "not-found": "That employee or template could not be found.",
  "already-linked": "This employee already has a linked account.",
  "invalid-role": "Choose an assignable role.",
  "platform-owner": "That email belongs to a Rock Frost platform account and cannot be linked here.",
  "seat-limit": "That role has no available seats.",
  "delivery-failed": "The account was created but the invitation email could not be delivered.",
};


export default async function HrEmployeeProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { employeeId } = await params;
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("hr");
  const canManage = hasPermission(tenant, PERMISSIONS.HR_EMPLOYEES_EDIT) || hasPermission(tenant, PERMISSIONS.HR_EMPLOYEES_MANAGE);
  const canLaunchPlans = hasPermission(tenant, PERMISSIONS.HR_ONBOARDING_MANAGE);
  const [employee, statusHistory, managers, onboardingTemplates, offboardingTemplates, pendingActivities, roles, assignableModuleKeys, employeeSkills, skillTypes] = await Promise.all([
    getEmployeeProfile(tenant.organizationId, employeeId),
    getEmployeeStatusHistory(tenant.organizationId, employeeId),
    listManagerCandidates(tenant.organizationId),
    listPlanTemplates(tenant.organizationId, "ONBOARDING"),
    listPlanTemplates(tenant.organizationId, "OFFBOARDING"),
    listPendingPlanActivities(tenant.organizationId, employeeId),
    db.role.findMany({
      where: { OR: [{ organizationId: tenant.organizationId }, { isSystem: true }], name: { not: "Super Admin" } },
      include: { rolePermissions: { include: { permission: true } } },
      orderBy: { name: "asc" },
    }),
    resolveAssignableModuleKeys(tenant.organizationId, tenant.enabledModuleKeys),
    listEmployeeSkills(tenant.organizationId, employeeId),
    listSkillTypes(tenant.organizationId),
  ]);
  if (!employee) notFound();
  const managerItems: Record<string, string> = Object.fromEntries(managers.filter((m) => m.id !== employee.id).map((m) => [m.id, m.fullName]));
  const defaultKind = employee.status === "TERMINATION_PENDING" ? "OFFBOARDING" : "ONBOARDING";
  const defaultTargetDate = (employee.status === "TERMINATION_PENDING" && employee.terminationDate ? employee.terminationDate : employee.hireDate).toISOString().slice(0, 10);
  const assignableRoles = roles.filter((role) => isRoleAssignableToOrganization(role, tenant.organizationId, assignableModuleKeys));
  const roleItems: Record<string, string> = Object.fromEntries(assignableRoles.map((role) => [role.id, roleDisplayName(role.name)]));

  return (
    <div className="space-y-6">
      <Link href="/app/hr/employees" className="text-sm text-muted-foreground hover:underline">Back to Employees</Link>

      {saved ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">Saved.</div>
      ) : null}
      {error && ERROR_MESSAGES[error] ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{ERROR_MESSAGES[error]}</div>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <PersonAvatar id={employee.id} fullName={employee.fullName} photoData={employee.photoData} />
          <div className="space-y-1.5">
            <h1 className="text-xl font-semibold">{employee.fullName}</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {employee.email ? <span className="flex items-center gap-1.5"><Mail className="size-3.5" />{employee.email}</span> : null}
              {employee.phone ? <span className="flex items-center gap-1.5"><Phone className="size-3.5" />{employee.phone}</span> : null}
              {employee.mobilePhone ? <span className="flex items-center gap-1.5"><Smartphone className="size-3.5" />{employee.mobilePhone}</span> : null}
            </div>
            <div className="flex flex-wrap gap-1">
              <Badge variant={STATUS_BADGE[employee.status]}>{employee.status.replace("_", " ")}</Badge>
              {employee.tags.map((tag) => <Badge key={tag} variant="outline">{tag}</Badge>)}
            </div>
          </div>
        </div>
        {canManage ? (
          <EntityDialog trigger={<Button size="sm" variant="outline">Edit</Button>} title="Edit employee" action={upsertEmployee} submitLabel="Save changes" contentClassName="sm:max-w-xl">
            <input type="hidden" name="id" value={employee.id} />
            <EmployeeFields employee={employee} managerItems={managerItems} />
          </EntityDialog>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <Link href="/app/hr/leave"><Button type="button" size="sm" variant="outline"><CalendarClock />Time off</Button></Link>
        {canLaunchPlans ? (
          <LaunchPlanDialog
            employeeId={employee.id}
            defaultKind={defaultKind}
            defaultTargetDate={defaultTargetDate}
            templates={[...onboardingTemplates, ...offboardingTemplates].map((t) => ({ id: t.id, kind: t.kind, name: t.name }))}
          />
        ) : null}
        <Dialog>
          <DialogTrigger render={<Button type="button" size="sm" variant="outline"><HistoryIcon />History</Button>} />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Status history</DialogTitle>
              <DialogDescription>Every status change recorded for {employee.fullName}.</DialogDescription>
            </DialogHeader>
            {statusHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No status changes recorded yet.</p>
            ) : (
              <ul className="max-h-80 space-y-3 overflow-y-auto text-sm">
                {statusHistory.map((entry) => (
                  <li key={entry.id} className="border-b pb-2 last:border-b-0">
                    <p className="font-medium">{entry.previousStatus.replace("_", " ")} → {entry.newStatus.replace("_", " ")}</p>
                    <p className="text-xs text-muted-foreground">{entry.effectiveDate.toLocaleDateString()}: {entry.reason}</p>
                  </li>
                ))}
              </ul>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {pendingActivities.length > 0 ? (
        <div className="space-y-2 rounded-xl border p-4">
          <h2 className="text-sm font-semibold">Pending activities</h2>
          <ul className="space-y-2">
            {pendingActivities.map((activity) => (
              <li key={activity.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
                <div>
                  <p>{activity.title}</p>
                  <p className="text-xs text-muted-foreground">Due {activity.dueDate.toLocaleDateString()}{!activity.ownerId ? " · no user assigned" : ""}</p>
                </div>
                {canLaunchPlans || canManage ? (
                  <form action={markPlanActivityDone}>
                    <input type="hidden" name="activityId" value={activity.id} />
                    <input type="hidden" name="employeeId" value={employee.id} />
                    <Button type="submit" size="sm" variant="ghost"><CircleCheck />Mark done</Button>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Tabs defaultValue="work">
        <TabsList>
          <TabsTrigger value="work">Work</TabsTrigger>
          <TabsTrigger value="resume">Resume</TabsTrigger>
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="work" className="space-y-6 pt-4">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div><dt className="text-xs text-muted-foreground">Employee number</dt><dd className="font-mono text-sm">{employee.employeeNumber}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Job title</dt><dd className="text-sm">{employee.jobTitle ?? "-"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Department</dt><dd className="text-sm">{employee.department ? <Link href={`/app/hr/employees?department=${encodeURIComponent(employee.department)}`} className="hover:underline">{employee.department}</Link> : "-"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Branch</dt><dd className="text-sm">{employee.branch?.name ?? "-"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Hire date</dt><dd className="text-sm">{employee.hireDate.toLocaleDateString()}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Manager</dt><dd className="text-sm">{employee.manager ? <Link href={`/app/hr/employees/${employee.manager.id}`} className="hover:underline">{employee.manager.fullName}</Link> : "-"}</dd></div>
          </dl>

          <div className="space-y-3 rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Organization chart</h2>
              <Link href={`/app/hr/employees/${employee.id}/org-chart`} className="flex items-center gap-1 text-xs text-primary hover:underline"><Network className="size-3.5" />Full chart</Link>
            </div>
            <div className="flex flex-col items-center gap-2">
              {employee.manager ? (
                <Link href={`/app/hr/employees/${employee.manager.id}`} className="flex flex-col items-center gap-1">
                  <PersonAvatar id={employee.manager.id} fullName={employee.manager.fullName} photoData={employee.manager.photoData} size={40} />
                  <span className="text-xs font-medium">{employee.manager.fullName}</span>
                  <span className="text-[11px] text-muted-foreground">{employee.manager.jobTitle ?? "-"}</span>
                </Link>
              ) : <p className="text-xs text-muted-foreground">No manager on record.</p>}
              <div className="h-4 w-px bg-border" />
              <div className="flex flex-col items-center gap-1 rounded-lg border-2 border-primary/40 p-2">
                <PersonAvatar id={employee.id} fullName={employee.fullName} photoData={employee.photoData} size={40} />
                <span className="text-xs font-medium">{employee.fullName}</span>
              </div>
              {employee.reports.length > 0 ? (
                <>
                  <div className="h-4 w-px bg-border" />
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <IconBadge size="sm"><span className="text-[11px] font-semibold">{employee.reports.length}</span></IconBadge>
                    {employee.reports.length === 1 ? "direct report" : "direct reports"}
                  </div>
                </>
              ) : null}
            </div>
          </div>

          <div className="space-y-3 rounded-xl border p-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="size-4" />Skills</h2>
              {canManage && skillTypes.some((t) => t.skills.length > 0) ? (
                <EntityDialog trigger={<Button size="sm" variant="outline">Add skill</Button>} title="Add a skill" action={saveEmployeeSkill}>
                  <input type="hidden" name="employeeId" value={employee.id} />
                  <div className="space-y-2">
                    <Label htmlFor="skill-id">Skill</Label>
                    <Select name="skillId" items={Object.fromEntries(skillTypes.flatMap((t) => t.skills.map((s) => [s.id, `${s.name} (${t.name})`])))}>
                      <SelectTrigger id="skill-id" className="w-full"><SelectValue placeholder="Choose a skill" /></SelectTrigger>
                      <SelectContent>
                        {skillTypes.map((t) => t.skills.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({t.name})</SelectItem>))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="skill-level">Level (1-5)</Label>
                    <Select name="level" defaultValue="3" items={{ "1": "1", "2": "2", "3": "3", "4": "4", "5": "5" }}>
                      <SelectTrigger id="skill-level" className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>{[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </EntityDialog>
              ) : null}
            </div>
            {employeeSkills.length === 0 ? (
              <p className="text-sm text-muted-foreground">No skills recorded yet.</p>
            ) : (
              <ul className="space-y-2">
                {employeeSkills.map((employeeSkill) => (
                  <li key={employeeSkill.id} className="flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{employeeSkill.skill.name} <span className="text-xs text-muted-foreground">({employeeSkill.skill.skillType.name})</span></p>
                      <div className="mt-1 flex gap-0.5">
                        {[1, 2, 3, 4, 5].map((segment) => (
                          <span key={segment} className={`h-1.5 flex-1 rounded-full ${segment <= employeeSkill.level ? "bg-primary" : "bg-secondary"}`} />
                        ))}
                      </div>
                    </div>
                    {canManage ? (
                      <form action={removeEmployeeSkillAction}>
                        <input type="hidden" name="id" value={employeeSkill.id} />
                        <input type="hidden" name="employeeId" value={employee.id} />
                        <Button type="submit" size="sm" variant="ghost"><X className="size-3.5" /></Button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
            {skillTypes.every((t) => t.skills.length === 0) ? (
              <p className="text-xs text-muted-foreground">No skills configured yet. Set some up in <Link href="/app/hr/configuration" className="text-primary hover:underline">HR Configuration</Link>.</p>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="resume" className="space-y-4 pt-4">
          {canManage ? (
            <EntityDialog trigger={<Button size="sm" variant="outline">Add entry</Button>} title="Add resume entry" action={saveResumeEntry}>
              <input type="hidden" name="employeeId" value={employee.id} />
              <div className="space-y-2">
                <Label htmlFor="resume-title">Title</Label>
                <Input id="resume-title" name="title" required placeholder="e.g. Sales Manager at Acme Ltd" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="resume-type">Type</Label>
                  <Select name="type" defaultValue="EXPERIENCE" items={RESUME_TYPE_LABEL}>
                    <SelectTrigger id="resume-type" className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(RESUME_TYPE_LABEL).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="resume-start">Start date</Label><Input id="resume-start" name="dateStart" type="date" required /></div>
                <div className="space-y-2"><Label htmlFor="resume-end">End date</Label><Input id="resume-end" name="dateEnd" type="date" /></div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="resume-description">Description</Label>
                <Textarea id="resume-description" name="description" rows={3} />
              </div>
            </EntityDialog>
          ) : null}
          {employee.resumeEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No resume entries yet.</p>
          ) : (
            <ul className="space-y-3">
              {employee.resumeEntries.map((entry) => (
                <li key={entry.id} className="rounded-md border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{entry.title}</p>
                        <Badge variant="outline">{RESUME_TYPE_LABEL[entry.type] ?? entry.type}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {entry.dateStart.toLocaleDateString()} – {entry.dateEnd ? entry.dateEnd.toLocaleDateString() : "Present"}
                      </p>
                      {entry.description ? <p className="mt-1 text-sm whitespace-pre-wrap">{entry.description}</p> : null}
                    </div>
                    {canManage ? (
                      <form action={removeResumeEntry}>
                        <input type="hidden" name="id" value={entry.id} />
                        <input type="hidden" name="employeeId" value={employee.id} />
                        <Button type="submit" size="sm" variant="ghost">Remove</Button>
                      </form>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="personal" className="space-y-4 pt-4">
          <dl className="grid gap-4 sm:grid-cols-2">
            <div><dt className="text-xs text-muted-foreground">Work email</dt><dd className="text-sm">{employee.email ?? "-"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Work phone</dt><dd className="text-sm">{employee.phone ?? "-"}</dd></div>
            <div><dt className="text-xs text-muted-foreground">Mobile phone</dt><dd className="text-sm">{employee.mobilePhone ?? "-"}</dd></div>
          </dl>
          {employee.notes ? (
            <div><p className="text-xs text-muted-foreground">Notes</p><p className="text-sm whitespace-pre-wrap">{employee.notes}</p></div>
          ) : null}
        </TabsContent>

        <TabsContent value="payroll" className="space-y-6 pt-4">
          {employee.payrollCompensation ? (
            <dl className="grid gap-4 sm:grid-cols-3">
              <div><dt className="text-xs text-muted-foreground">Base salary</dt><dd className="text-sm">{Number(employee.payrollCompensation.baseSalary).toFixed(2)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Pay frequency</dt><dd className="text-sm">{employee.payrollCompensation.payFrequency}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Effective date</dt><dd className="text-sm">{employee.payrollCompensation.effectiveDate.toLocaleDateString()}</dd></div>
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">No compensation set. <Link href="/app/payroll/compensation" className="text-primary hover:underline">Set it up in Payroll</Link>.</p>
          )}
          <div>
            <h3 className="mb-2 text-sm font-semibold">Recent payslips</h3>
            {employee.payslips.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payslips yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {employee.payslips.map((slip) => (
                  <li key={slip.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <span className="text-muted-foreground">{slip.createdAt.toLocaleDateString()}</span>
                    <span>Net {Number(slip.netPay).toFixed(2)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4 pt-4">
          {employee.user ? (
            <dl className="grid gap-4 sm:grid-cols-2">
              <div><dt className="text-xs text-muted-foreground">Linked account</dt><dd className="text-sm">{employee.user.email}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Account status</dt><dd className="text-sm">{employee.user.status}</dd></div>
            </dl>
          ) : canManage ? (
            employee.email ? (
              <EntityDialog trigger={<Button size="sm">Create user</Button>} title="Create a user account" description={`Sends an invitation to ${employee.email} to sign in and access this organization.`} action={createUserForEmployee}>
                <input type="hidden" name="employeeId" value={employee.id} />
                <div className="space-y-2">
                  <Label htmlFor="roleId">Role</Label>
                  <Select name="roleId" items={roleItems}>
                    <SelectTrigger id="roleId" className="w-full"><SelectValue placeholder="Choose a role" /></SelectTrigger>
                    <SelectContent>{Object.entries(roleItems).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </EntityDialog>
            ) : (
              <p className="text-sm text-muted-foreground">Add a work email for this employee before creating an account.</p>
            )
          ) : (
            <p className="text-sm text-muted-foreground">No platform user account is linked to this employee yet.</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
