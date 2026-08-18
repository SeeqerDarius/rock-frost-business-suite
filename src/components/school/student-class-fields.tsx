"use client";

import { useState } from "react";
import { SelectField, type SelectOption } from "@/components/school/form-fields";

interface StudentClassFieldsProps {
  studentFieldId: string;
  studentFieldName: string;
  studentOptions: SelectOption[];
  studentHint?: string;
  classFieldId: string;
  classFieldName: string;
  classOptions: SelectOption[];
  classHint?: string;
  /** studentId -> their current active enrollment's classId, used to default the Class field when a student is picked. */
  studentClassMap: Record<string, string>;
}

/**
 * Selecting a student defaults the Class field to their current active
 * enrollment instead of leaving it on "Select…" every time. Both fields
 * stay real, independently editable native <select>s the server action
 * reads by name - this only sets a sensible starting value.
 */
export function StudentClassFields({
  studentFieldId,
  studentFieldName,
  studentOptions,
  studentHint,
  classFieldId,
  classFieldName,
  classOptions,
  classHint,
  studentClassMap,
}: StudentClassFieldsProps) {
  const [classValue, setClassValue] = useState("");

  return (
    <>
      <SelectField
        id={studentFieldId}
        name={studentFieldName}
        label="Student"
        required
        options={studentOptions}
        emptyHint="Only active students can be marked."
        hint={studentHint}
        onChange={(event) => setClassValue(studentClassMap[event.target.value] ?? "")}
      />
      <SelectField
        id={classFieldId}
        name={classFieldName}
        label="Class"
        required
        options={classOptions}
        emptyHint="Create a class first."
        hint={classHint}
        value={classValue}
        onChange={(event) => setClassValue(event.target.value)}
      />
    </>
  );
}
