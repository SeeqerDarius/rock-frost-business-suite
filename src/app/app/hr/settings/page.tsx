import { Lock, CalendarClock, Hash, ListChecks, Plus, Sparkles, X, Users, MapPin, LogOut, Clock, Briefcase, FileText } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SettingsBanner } from "@/components/settings/settings-banner";
import { SettingsToggleRow } from "@/components/settings/settings-toggle-row";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { formatMoney } from "@/lib/currency";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import {
  getHrSettings, listLeaveTypes, listPlanTemplates,
  listSkillTypes, listEmployeeTypes, listWorkLocations, listDepartureReasons,
  listWorkingSchedules, listTimeTypes, listJobPositions, listContractTemplates,
  listContractTemplateResponsibleCandidates,
} from "@/modules/hr/service";
import { addLeaveType, saveHrSettings, savePlanTemplate, removePlanTemplate } from "./actions";
import { PlanTemplateForm } from "./plan-template-form";
import { NamedLookupSection } from "../configuration/named-lookup-section";
import { ContractTemplateFields } from "../configuration/contract-template-fields";
import {
  addSkillType, removeSkillType, addSkill, removeSkill,
  addEmployeeType, removeEmployeeType,
  addWorkLocation, removeWorkLocation,
  addDepartureReason, removeDepartureReason,
  addWorkingSchedule, removeWorkingSchedule,
  addTimeType, removeTimeType,
  addJobPosition, removeJobPosition,
  saveContractTemplate, removeContractTemplate,
} from "../configuration/actions";

const WORK_LOCATION_TYPE_LABELS: Record<string, string> = { OFFICE: "Office", REMOTE: "Remote", HYBRID: "Hybrid" };
const PAY_FREQUENCY_LABEL: Record<string, string> = { MONTHLY: "Monthly", BIWEEKLY: "Bi-weekly", WEEKLY: "Weekly" };
const WAGE_TYPE_LABEL: Record<string, string> = { FIXED: "Fixed", HOURLY: "Hourly" };

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage HR settings.",
  "missing-fields": "A name is required.",
  "invalid-prefix": "Use 2-8 uppercase letters or numbers.",
  duplicate: "That name is already in use.",
  "not-found": "That item could not be found.",
};

const PLAN_KIND_LABEL: Record<string, string> = { ONBOARDING: "Onboarding", OFFBOARDING: "Offboarding" };

export default async function HrSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("hr");

  if (!hasPermission(tenant, PERMISSIONS.HR_SETTINGS_MANAGE)) {
    return (
      <div className="space-y-6">
        <PageHeader title="HR Settings" description="Module-wide configuration for Human Resources." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="HR settings are limited to roles with settings permissions." />
      </div>
    );
  }

  const canManagePlans = hasPermission(tenant, PERMISSIONS.HR_ONBOARDING_MANAGE);
  const [
    leaveTypes, settings, onboardingTemplates, offboardingTemplates,
    skillTypes, employeeTypes, workLocations, departureReasons, workingSchedules, timeTypes, jobPositions, contractTemplates,
    contractResponsibleCandidates,
  ] = await Promise.all([
    listLeaveTypes(tenant.organizationId),
    getHrSettings(tenant.organizationId),
    listPlanTemplates(tenant.organizationId, "ONBOARDING"),
    listPlanTemplates(tenant.organizationId, "OFFBOARDING"),
    listSkillTypes(tenant.organizationId),
    listEmployeeTypes(tenant.organizationId),
    listWorkLocations(tenant.organizationId),
    listDepartureReasons(tenant.organizationId),
    listWorkingSchedules(tenant.organizationId),
    listTimeTypes(tenant.organizationId),
    listJobPositions(tenant.organizationId),
    listContractTemplates(tenant.organizationId),
    listContractTemplateResponsibleCandidates(tenant.organizationId),
  ]);
  const jobPositionItems: Record<string, string> = Object.fromEntries(jobPositions.map((p) => [p.id, p.name]));
  const employeeTypeItems: Record<string, string> = Object.fromEntries(employeeTypes.map((t) => [t.id, t.name]));
  const workingScheduleItems: Record<string, string> = Object.fromEntries(workingSchedules.map((s) => [s.id, s.name]));
  const responsibleItems: Record<string, string> = Object.fromEntries(contractResponsibleCandidates.map((u) => [u.id, u.name ?? u.email]));

  return (
    <div className="space-y-6">
      <PageHeader title="HR Settings" description="Module-wide configuration for Human Resources." />

      <SettingsBanner saved={saved} error={error} errorMessages={ERROR_MESSAGES} />

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Hash className="size-5 text-muted-foreground" />
                <CardTitle>Employee numbering</CardTitle>
              </div>
              <CardDescription>e.g. &quot;EMP&quot; → EMP-0001. Existing employee numbers are not renumbered.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form action={saveHrSettings} className="space-y-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="employeeNumberPrefix" required>Employee number prefix</Label>
                    <Input id="employeeNumberPrefix" name="employeeNumberPrefix" defaultValue={settings.employeeNumberPrefix} minLength={2} maxLength={8} className="w-32 uppercase" required />
                  </div>
                </div>
                <SettingsToggleRow
                  id="terminationApprovalRequired"
                  name="terminationApprovalRequired"
                  label="Require a different HR approver for termination"
                  defaultChecked={settings.terminationApprovalRequired}
                />
                <Button type="submit" size="sm" variant="outline">Save</Button>
              </form>
            </CardContent>
          </Card>

          <Card className="shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-2">
                <CalendarClock className="size-5 text-muted-foreground" />
                <CardTitle>Leave types</CardTitle>
              </div>
              <CardDescription>Categories of time off employees can request against.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {leaveTypes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No leave types yet. Add one before employees can request leave.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {leaveTypes.map((type) => (
                    <Badge key={type.id} variant="outline">
                      {type.name} ({type.defaultDaysPerYear} days/yr)
                    </Badge>
                  ))}
                </div>
              )}
              <form action={addLeaveType} className="flex flex-wrap items-end gap-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" placeholder="e.g. Annual, Sick, Unpaid" className="max-w-xs" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="defaultDaysPerYear">Days per year</Label>
                  <Input id="defaultDaysPerYear" name="defaultDaysPerYear" type="number" defaultValue="0" className="w-32" />
                </div>
                <Button type="submit" size="sm" variant="outline">
                  Add leave type
                </Button>
              </form>
            </CardContent>
          </Card>

          {canManagePlans ? (
            <Card className="shadow-sm">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <ListChecks className="size-5 text-muted-foreground" />
                  <CardTitle>Onboarding &amp; offboarding plans</CardTitle>
                </div>
                <CardDescription>Checklist templates that generate dated, owner-assigned activities when launched from an employee&apos;s profile.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {([["ONBOARDING", onboardingTemplates], ["OFFBOARDING", offboardingTemplates]] as const).map(([kind, templates]) => (
                  <div key={kind} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">{PLAN_KIND_LABEL[kind]}</h3>
                      <Dialog>
                        <DialogTrigger render={<Button size="sm" variant="outline"><Plus />New template</Button>} />
                        <DialogContent className="sm:max-w-2xl">
                          <DialogHeader><DialogTitle>New {PLAN_KIND_LABEL[kind].toLowerCase()} template</DialogTitle></DialogHeader>
                          <PlanTemplateForm defaultKind={kind} action={savePlanTemplate} />
                        </DialogContent>
                      </Dialog>
                    </div>
                    {templates.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No {PLAN_KIND_LABEL[kind].toLowerCase()} templates yet.</p>
                    ) : (
                      <ul className="space-y-2">
                        {templates.map((template) => (
                          <li key={template.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                            <div>
                              <p className="text-sm font-medium">{template.name}</p>
                              <p className="text-xs text-muted-foreground">{template.activities.length} {template.activities.length === 1 ? "activity" : "activities"}</p>
                            </div>
                            <div className="flex gap-1">
                              <Dialog>
                                <DialogTrigger render={<Button size="sm" variant="ghost">Edit</Button>} />
                                <DialogContent className="sm:max-w-2xl">
                                  <DialogHeader><DialogTitle>Edit {template.name}</DialogTitle></DialogHeader>
                                  <PlanTemplateForm id={template.id} defaultKind={kind} defaultName={template.name} defaultActivities={template.activities} action={savePlanTemplate} />
                                </DialogContent>
                              </Dialog>
                              <form action={removePlanTemplate}>
                                <input type="hidden" name="id" value={template.id} />
                                <Button type="submit" size="sm" variant="ghost">Delete</Button>
                              </form>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="configuration" className="space-y-6">
          <Card className="shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Sparkles className="size-5 text-muted-foreground" />
                <CardTitle>Skills</CardTitle>
              </div>
              <CardDescription>Skill types and the skills within them, assignable to employees from their profile.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {skillTypes.length === 0 ? (
                <p className="text-sm text-muted-foreground">No skill types yet. Add one to start building your skills catalogue.</p>
              ) : (
                skillTypes.map((skillType) => (
                  <div key={skillType.id} className="space-y-2 rounded-md border p-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">{skillType.name}</h3>
                      <form action={removeSkillType}>
                        <input type="hidden" name="id" value={skillType.id} />
                        <Button type="submit" size="sm" variant="ghost">Delete type</Button>
                      </form>
                    </div>
                    {skillType.skills.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {skillType.skills.map((skill) => (
                          <form key={skill.id} action={removeSkill} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
                            <span>{skill.name}</span>
                            <input type="hidden" name="id" value={skill.id} />
                            <button type="submit" className="text-muted-foreground hover:text-destructive" aria-label={`Remove ${skill.name}`}>
                              <X className="size-3" />
                            </button>
                          </form>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No skills in this type yet.</p>
                    )}
                    <form action={addSkill} className="flex gap-2">
                      <input type="hidden" name="skillTypeId" value={skillType.id} />
                      <Input name="name" placeholder="New skill" className="h-8 max-w-xs" />
                      <Button type="submit" size="sm" variant="outline">Add skill</Button>
                    </form>
                  </div>
                ))
              )}
              <form action={addSkillType} className="flex gap-2">
                <Input name="name" placeholder="New skill type (e.g. Languages)" className="h-8 max-w-xs" />
                <Button type="submit" size="sm" variant="outline"><Plus />Add skill type</Button>
              </form>
            </CardContent>
          </Card>

          <NamedLookupSection
            title="Employee Types"
            icon={<Users className="size-5 text-muted-foreground" />}
            description="Employment categories, such as Full Time or Contractor."
            items={employeeTypes}
            addAction={addEmployeeType}
            removeAction={removeEmployeeType}
          />

          <NamedLookupSection
            title="Work Locations"
            icon={<MapPin className="size-5 text-muted-foreground" />}
            description="Where employees are based: office, remote, or hybrid."
            items={workLocations.map((l) => ({ id: l.id, name: l.name, extra: WORK_LOCATION_TYPE_LABELS[l.locationType] }))}
            addAction={addWorkLocation}
            removeAction={removeWorkLocation}
            extraField={{ name: "locationType", label: "Type", options: WORK_LOCATION_TYPE_LABELS, defaultValue: "OFFICE" }}
          />

          <NamedLookupSection
            title="Departure Reasons"
            icon={<LogOut className="size-5 text-muted-foreground" />}
            description="Standard reasons recorded when an employee leaves."
            items={departureReasons}
            addAction={addDepartureReason}
            removeAction={removeDepartureReason}
          />

          <NamedLookupSection
            title="Working Schedules"
            icon={<CalendarClock className="size-5 text-muted-foreground" />}
            description="Named schedules, such as Standard 40 Hours or Part Time."
            items={workingSchedules}
            addAction={addWorkingSchedule}
            removeAction={removeWorkingSchedule}
          />

          <NamedLookupSection
            title="Time Types"
            icon={<Clock className="size-5 text-muted-foreground" />}
            description="Categories used for logging time, such as Attendance or Overtime."
            items={timeTypes}
            addAction={addTimeType}
            removeAction={removeTimeType}
          />

          <NamedLookupSection
            title="Job Positions"
            icon={<Briefcase className="size-5 text-muted-foreground" />}
            description="A reusable catalogue of job titles, offered as suggestions on the employee form."
            items={jobPositions}
            addAction={addJobPosition}
            removeAction={removeJobPosition}
          />

          <Card className="shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <FileText className="size-5 text-muted-foreground" />
                  <CardTitle>Contract Templates</CardTitle>
                </div>
                <Dialog>
                  <DialogTrigger render={<Button size="sm" variant="outline"><Plus />New template</Button>} />
                  <DialogContent className="sm:max-w-2xl">
                    <DialogHeader><DialogTitle>New contract template</DialogTitle></DialogHeader>
                    <form action={saveContractTemplate} className="space-y-4">
                      <ContractTemplateFields
                        jobPositionItems={jobPositionItems}
                        employeeTypeItems={employeeTypeItems}
                        workingScheduleItems={workingScheduleItems}
                        responsibleItems={responsibleItems}
                      />
                      <Button type="submit" className="w-full">Create template</Button>
                    </form>
                  </DialogContent>
                </Dialog>
              </div>
              <CardDescription>What a job&apos;s contract should start from: job, HR responsible, department, and salary information.</CardDescription>
            </CardHeader>
            <CardContent>
              {contractTemplates.length === 0 ? (
                <p className="text-sm text-muted-foreground">No contract templates yet.</p>
              ) : (
                <ul className="space-y-2">
                  {contractTemplates.map((template) => (
                    <li key={template.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                      <div>
                        <p className="text-sm font-medium">{template.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {template.jobPosition?.name ?? "No job"} · {template.department ?? "No department"} · {PAY_FREQUENCY_LABEL[template.payFrequency] ?? template.payFrequency} {WAGE_TYPE_LABEL[template.wageType] ?? template.wageType} {formatMoney(template.wage, tenant.organization.currency)}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <Dialog>
                          <DialogTrigger render={<Button size="sm" variant="ghost">Edit</Button>} />
                          <DialogContent className="sm:max-w-2xl">
                            <DialogHeader><DialogTitle>Edit {template.name}</DialogTitle></DialogHeader>
                            <form action={saveContractTemplate} className="space-y-4">
                              <input type="hidden" name="id" value={template.id} />
                              <ContractTemplateFields
                                template={{
                                  id: template.id,
                                  name: template.name,
                                  jobPositionId: template.jobPositionId,
                                  department: template.department,
                                  hrResponsibleId: template.hrResponsibleId,
                                  employeeTypeId: template.employeeTypeId,
                                  wageType: template.wageType,
                                  payFrequency: template.payFrequency,
                                  wage: template.wage.toString(),
                                  excludedFromPayRuns: template.excludedFromPayRuns,
                                  workingScheduleId: template.workingScheduleId,
                                }}
                                jobPositionItems={jobPositionItems}
                                employeeTypeItems={employeeTypeItems}
                                workingScheduleItems={workingScheduleItems}
                                responsibleItems={responsibleItems}
                              />
                              <Button type="submit" className="w-full">Save changes</Button>
                            </form>
                          </DialogContent>
                        </Dialog>
                        <form action={removeContractTemplate}>
                          <input type="hidden" name="id" value={template.id} />
                          <Button type="submit" size="sm" variant="ghost">Delete</Button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
