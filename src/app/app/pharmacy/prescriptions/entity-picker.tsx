"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NEW_ENTITY = "__new__";

/**
 * A walk-in with a paper prescription is often not yet a registered patient
 * or prescriber - picking "+ New patient" here reveals inline fields so
 * front-desk staff can register them as part of this same submission,
 * instead of leaving the dialog to create the record first.
 */
export function PatientPicker({ patients }: { patients: { id: string; fullName: string }[] }) {
  const [value, setValue] = useState("");
  const patientItems: Record<string, string> = Object.fromEntries(patients.map((x) => [x.id, x.fullName]));

  return (
    <div className="space-y-2">
      <Label htmlFor="prescription-patientId" required>Patient</Label>
      <Select name="patientId" value={value} onValueChange={(next) => next && setValue(next)} items={{ ...patientItems, [NEW_ENTITY]: "+ New patient (walk-in)" }}>
        <SelectTrigger id="prescription-patientId" className="w-full"><SelectValue placeholder="Select patient" /></SelectTrigger>
        <SelectContent>
          {patients.map((x) => <SelectItem key={x.id} value={x.id}>{x.fullName}</SelectItem>)}
          <SelectItem value={NEW_ENTITY}>+ New patient (walk-in)</SelectItem>
        </SelectContent>
      </Select>
      {value === NEW_ENTITY ? (
        <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="newPatientNumber" required>New patient number</Label>
            <Input id="newPatientNumber" name="newPatientNumber" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPatientFullName" required>Full name</Label>
            <Input id="newPatientFullName" name="newPatientFullName" required />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="newPatientPhone">Phone</Label>
            <Input id="newPatientPhone" name="newPatientPhone" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function PrescriberPicker({ prescribers }: { prescribers: { id: string; fullName: string }[] }) {
  const [value, setValue] = useState("");
  const prescriberItems: Record<string, string> = Object.fromEntries(prescribers.map((x) => [x.id, x.fullName]));

  return (
    <div className="space-y-2">
      <Label htmlFor="prescription-prescriberId" required>Prescriber</Label>
      <Select name="prescriberId" value={value} onValueChange={(next) => next && setValue(next)} items={{ ...prescriberItems, [NEW_ENTITY]: "+ New prescriber" }}>
        <SelectTrigger id="prescription-prescriberId" className="w-full"><SelectValue placeholder="Select prescriber" /></SelectTrigger>
        <SelectContent>
          {prescribers.map((x) => <SelectItem key={x.id} value={x.id}>{x.fullName}</SelectItem>)}
          <SelectItem value={NEW_ENTITY}>+ New prescriber</SelectItem>
        </SelectContent>
      </Select>
      {value === NEW_ENTITY ? (
        <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="newPrescriberFullName" required>Full name</Label>
            <Input id="newPrescriberFullName" name="newPrescriberFullName" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPrescriberRegistrationNumber" required>Registration number</Label>
            <Input id="newPrescriberRegistrationNumber" name="newPrescriberRegistrationNumber" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPrescriberFacilityName">Facility</Label>
            <Input id="newPrescriberFacilityName" name="newPrescriberFacilityName" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPrescriberPhone">Phone</Label>
            <Input id="newPrescriberPhone" name="newPrescriberPhone" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
