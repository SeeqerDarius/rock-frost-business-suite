import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const WAGE_TYPE_ITEMS: Record<string, string> = { FIXED: "Fixed Wage", HOURLY: "Hourly Wage" };
const PAY_FREQUENCY_ITEMS: Record<string, string> = { MONTHLY: "Monthly", BIWEEKLY: "Bi-weekly", WEEKLY: "Weekly" };

export interface ContractTemplateFieldsData {
  id: string;
  name: string;
  jobPositionId: string | null;
  department: string | null;
  hrResponsibleId: string | null;
  employeeTypeId: string | null;
  wageType: string;
  payFrequency: string;
  wage: number | string;
  excludedFromPayRuns: boolean;
  workingScheduleId: string | null;
}

/** Mirrors Odoo's own Contract Template form: template name, job, HR
 * responsible, and department up top, then a Salary Information section
 * (contract overview + schedule). Every dropdown here reuses the same
 * Configuration lookups (Job Positions, Employee Types, Working Schedules)
 * rather than duplicating them. A plain server-rendered form, not a client
 * component - no dynamic row state is needed here the way it is for the
 * Launch Plan template editor. */
export function ContractTemplateFields({
  template,
  jobPositionItems,
  employeeTypeItems,
  workingScheduleItems,
  responsibleItems,
}: {
  template?: ContractTemplateFieldsData;
  jobPositionItems: Record<string, string>;
  employeeTypeItems: Record<string, string>;
  workingScheduleItems: Record<string, string>;
  responsibleItems: Record<string, string>;
}) {
  const idSuffix = template ? `-${template.id}` : "-new";

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`ctName${idSuffix}`}>Template name</Label>
        <Input id={`ctName${idSuffix}`} name="name" defaultValue={template?.name} required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`ctJobPositionId${idSuffix}`}>Job</Label>
          <Select name="jobPositionId" defaultValue={template?.jobPositionId ?? ""} items={{ "": "None", ...jobPositionItems }}>
            <SelectTrigger id={`ctJobPositionId${idSuffix}`} className="w-full"><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">None</SelectItem>
              {Object.entries(jobPositionItems).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`ctDepartment${idSuffix}`}>Department</Label>
          <Input id={`ctDepartment${idSuffix}`} name="department" defaultValue={template?.department ?? ""} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`ctHrResponsibleId${idSuffix}`}>HR Responsible</Label>
        <Select name="hrResponsibleId" defaultValue={template?.hrResponsibleId ?? ""} items={{ "": "Unassigned", ...responsibleItems }}>
          <SelectTrigger id={`ctHrResponsibleId${idSuffix}`} className="w-full"><SelectValue placeholder="Unassigned" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">Unassigned</SelectItem>
            {Object.entries(responsibleItems).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3 rounded-md border p-3">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Contract overview</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`ctEmployeeTypeId${idSuffix}`}>Employee type</Label>
            <Select name="employeeTypeId" defaultValue={template?.employeeTypeId ?? ""} items={{ "": "None", ...employeeTypeItems }}>
              <SelectTrigger id={`ctEmployeeTypeId${idSuffix}`} className="w-full"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">None</SelectItem>
                {Object.entries(employeeTypeItems).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`ctWageType${idSuffix}`}>Wage type</Label>
            <Select name="wageType" defaultValue={template?.wageType ?? "FIXED"} items={WAGE_TYPE_ITEMS}>
              <SelectTrigger id={`ctWageType${idSuffix}`} className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(WAGE_TYPE_ITEMS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`ctPayFrequency${idSuffix}`}>Pay schedule</Label>
            <Select name="payFrequency" defaultValue={template?.payFrequency ?? "MONTHLY"} items={PAY_FREQUENCY_ITEMS}>
              <SelectTrigger id={`ctPayFrequency${idSuffix}`} className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(PAY_FREQUENCY_ITEMS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`ctWage${idSuffix}`}>Wage</Label>
            <Input id={`ctWage${idSuffix}`} name="wage" type="number" step="0.01" min="0" defaultValue={template?.wage !== undefined ? String(template.wage) : "0"} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="excludedFromPayRuns" defaultChecked={template?.excludedFromPayRuns} />
          Employee will be excluded from Pay Runs
        </label>
      </div>

      <div className="space-y-2 rounded-md border p-3">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Schedule</p>
        <div className="space-y-2">
          <Label htmlFor={`ctWorkingScheduleId${idSuffix}`}>Working hours</Label>
          <Select name="workingScheduleId" defaultValue={template?.workingScheduleId ?? ""} items={{ "": "None", ...workingScheduleItems }}>
            <SelectTrigger id={`ctWorkingScheduleId${idSuffix}`} className="w-full"><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">None</SelectItem>
              {Object.entries(workingScheduleItems).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
    </>
  );
}
