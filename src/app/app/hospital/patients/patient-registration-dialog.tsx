"use client";

import { useActionState, useState, type ReactElement } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkPatientDuplicatesAction, createPatientAction, type PatientDuplicateCheckState } from "../actions";

const initialState: PatientDuplicateCheckState = {};

/**
 * Duplicate detection here is advisory only — see
 * findHospitalPatientDuplicates in src/modules/hospital/service.ts. The
 * "Check for existing patients" button uses formAction to run
 * checkPatientDuplicatesAction without submitting the real registration;
 * the primary submit still goes straight to createPatientAction whether or
 * not a check was ever run, so registration is never blocked by this.
 */
export function PatientRegistrationDialog({ trigger }: { trigger: ReactElement }) {
  const [open, setOpen] = useState(false);
  const [checkState, checkAction, checking] = useActionState(checkPatientDuplicatesAction, initialState);

  const field = (name: string, label: string, type = "text", required = true) => (
    <div><Label htmlFor={name}>{label}</Label><Input id={name} name={name} type={type} required={required} /></div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Register patient</DialogTitle>
          <DialogDescription>Duplicate names/dates of birth are flagged for review at the front desk, never blocked automatically.</DialogDescription>
        </DialogHeader>
        <form action={createPatientAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {field("firstName", "First name")}
            {field("lastName", "Last name")}
            {field("dateOfBirth", "Date of birth", "date")}
            <div><Label htmlFor="sex">Sex</Label><select id="sex" name="sex" required className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"><option value="">Select…</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option></select></div>
            {field("phone", "Phone", "text", false)}
            {field("email", "Email", "email", false)}
            {field("bloodGroup", "Blood group", "text", false)}
            {field("nationalIdNumber", "National ID number", "text", false)}
          </div>
          <div><Label htmlFor="address">Address</Label><Input id="address" name="address" /></div>
          <div><Label htmlFor="allergies">Allergies</Label><Input id="allergies" name="allergies" placeholder="e.g. Penicillin, peanuts" /></div>
          <div className="grid gap-4 sm:grid-cols-3">
            {field("nextOfKinName", "Next of kin name", "text", false)}
            {field("nextOfKinPhone", "Next of kin phone", "text", false)}
            {field("nextOfKinRelationship", "Relationship", "text", false)}
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {field("emergencyContactName", "Emergency contact", "text", false)}
            {field("emergencyContactPhone", "Emergency phone", "text", false)}
            {field("emergencyContactRelation", "Relationship", "text", false)}
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="consentOnFile" className="size-4" />Signed general consent already on file</label>

          <Button type="submit" formAction={checkAction} variant="outline" className="w-full" disabled={checking}>
            {checking ? "Checking…" : "Check for existing patients"}
          </Button>
          {checkState.duplicates && checkState.duplicates.length > 0 ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400" aria-live="polite">
              Possible existing record{checkState.duplicates.length > 1 ? "s" : ""} with the same name and date of birth: {checkState.duplicates.map((d) => `${d.mrn} (${d.firstName} ${d.lastName})`).join(", ")}. You can still register, this is advisory only.
            </div>
          ) : checkState.duplicates ? (
            <p className="text-xs text-muted-foreground" aria-live="polite">No matching patients found.</p>
          ) : null}

          <Button type="submit" className="w-full">Register patient</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
