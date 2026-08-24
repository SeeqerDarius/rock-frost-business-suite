import Image from "next/image";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface EmployeeFieldsProps {
  employee?: { id: string; fullName: string; email: string | null; phone: string | null; mobilePhone: string | null; tags: string[]; photoData: string | null; jobTitle: string | null; department: string | null; hireDate: Date; managerId: string | null; notes: string | null };
  managerItems: Record<string, string>;
}

export function EmployeeFields({ employee, managerItems }: EmployeeFieldsProps) {
  const idSuffix = employee ? "-edit" : "";
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={`fullName${idSuffix}`}>Full name</Label>
        <Input id={`fullName${idSuffix}`} name="fullName" defaultValue={employee?.fullName} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`photo${idSuffix}`}>{employee?.photoData ? "Replace photo" : "Photo"}</Label>
        {employee?.photoData ? (
          <div className="flex items-center gap-3 rounded-md border p-2">
            <Image src={`/api/hr/employees/${employee.id}/photo`} alt={employee.fullName} width={56} height={56} unoptimized className="size-14 rounded-full object-cover" />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="removePhoto" />Remove current photo</label>
          </div>
        ) : null}
        <Input id={`photo${idSuffix}`} name="photo" type="file" accept="image/jpeg,image/png,image/webp" />
        <p className="text-xs text-muted-foreground">Optional JPG, PNG, or WebP, up to 1 MB.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`jobTitle${idSuffix}`}>Job title</Label>
          <Input id={`jobTitle${idSuffix}`} name="jobTitle" defaultValue={employee?.jobTitle ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`department${idSuffix}`}>Department</Label>
          <Input id={`department${idSuffix}`} name="department" defaultValue={employee?.department ?? ""} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`email${idSuffix}`}>Email</Label>
          <Input id={`email${idSuffix}`} name="email" type="email" defaultValue={employee?.email ?? ""} />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`phone${idSuffix}`}>Work phone</Label>
          <Input id={`phone${idSuffix}`} name="phone" defaultValue={employee?.phone ?? ""} />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`mobilePhone${idSuffix}`}>Mobile phone</Label>
        <Input id={`mobilePhone${idSuffix}`} name="mobilePhone" defaultValue={employee?.mobilePhone ?? ""} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`hireDate${idSuffix}`}>Hire date</Label>
          <Input
            id={`hireDate${idSuffix}`}
            name="hireDate"
            type="date"
            defaultValue={employee?.hireDate ? employee.hireDate.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`managerId${idSuffix}`}>Manager</Label>
          <Select name="managerId" defaultValue={employee?.managerId ?? ""} items={{ "": "None", ...managerItems }}>
            <SelectTrigger id={`managerId${idSuffix}`} className="w-full">
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">None</SelectItem>
              {Object.entries(managerItems).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`tags${idSuffix}`}>Tags</Label>
        <Input id={`tags${idSuffix}`} name="tags" defaultValue={employee?.tags.join(", ") ?? ""} placeholder="e.g. Consultant, Remote" />
        <p className="text-xs text-muted-foreground">Comma-separated.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor={`notes${idSuffix}`}>Notes</Label>
        <Textarea id={`notes${idSuffix}`} name="notes" defaultValue={employee?.notes ?? ""} rows={3} />
      </div>
    </>
  );
}
