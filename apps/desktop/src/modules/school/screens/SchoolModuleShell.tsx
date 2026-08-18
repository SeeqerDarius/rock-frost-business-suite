import { useState } from "react";
import { useApp } from "@/state/AppProvider";
import { useSchoolSnapshot } from "@/modules/school/school-data";
import { SchoolAcademicSetupScreen } from "@/modules/school/screens/SchoolAcademicSetupScreen";
import { SchoolStudentsScreen } from "@/modules/school/screens/SchoolStudentsScreen";
import { SchoolEnrollmentScreen } from "@/modules/school/screens/SchoolEnrollmentScreen";
import { SchoolAttendanceScreen } from "@/modules/school/screens/SchoolAttendanceScreen";
import { SchoolFeesScreen } from "@/modules/school/screens/SchoolFeesScreen";
import { SchoolExamsScreen } from "@/modules/school/screens/SchoolExamsScreen";
import { SchoolTimetableScreen } from "@/modules/school/screens/SchoolTimetableScreen";
import { SchoolLibraryScreen } from "@/modules/school/screens/SchoolLibraryScreen";
import { SchoolTransportScreen } from "@/modules/school/screens/SchoolTransportScreen";
import { SchoolPayrollScreen } from "@/modules/school/screens/SchoolPayrollScreen";
import { SchoolSettingsScreen } from "@/modules/school/screens/SchoolSettingsScreen";

const TABS = [
  { key: "setup", label: "Academic setup" },
  { key: "students", label: "Students & guardians" },
  { key: "enrollment", label: "Enrollment" },
  { key: "attendance", label: "Attendance" },
  { key: "fees", label: "Fees" },
  { key: "exams", label: "Exams" },
  { key: "timetable", label: "Timetable" },
  { key: "library", label: "Library" },
  { key: "transport", label: "Transport" },
  { key: "payroll", label: "Payroll" },
  { key: "settings", label: "Settings" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * School's own multi-screen mini-app, mirroring PosModuleShell's structure
 * so later School milestones (timetable, library, transport, payroll,
 * settings) each add a tab here rather than a new top-level component.
 * Milestone 6 shipped Academic setup; milestone 7 added Students &
 * guardians, Enrollment, and Attendance; milestone 8 added Fees;
 * milestone 9 added Exams; milestone 10 adds Timetable, Library,
 * Transport, Payroll, and Settings - the full 14-page School surface.
 */
export function SchoolModuleShell() {
  const { db } = useApp();
  const { snapshot, reload } = useSchoolSnapshot(db);
  const [tab, setTab] = useState<TabKey>("setup");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <nav aria-label="School sections" style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", borderBottom: "1px solid var(--rf-border)", paddingBottom: "0.6rem" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-current={tab === t.key ? "page" : undefined}
            style={{
              padding: "0.4rem 0.85rem",
              borderRadius: "999px",
              border: "1px solid var(--rf-border)",
              background: tab === t.key ? "var(--rf-primary)" : "var(--rf-card)",
              color: tab === t.key ? "var(--rf-primary-foreground)" : "var(--rf-card-foreground)",
              fontSize: "0.8125rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "setup" ? <SchoolAcademicSetupScreen snapshot={snapshot} onChanged={reload} /> : null}
      {tab === "students" ? <SchoolStudentsScreen snapshot={snapshot} onChanged={reload} /> : null}
      {tab === "enrollment" ? <SchoolEnrollmentScreen snapshot={snapshot} onChanged={reload} /> : null}
      {tab === "attendance" ? <SchoolAttendanceScreen snapshot={snapshot} onChanged={reload} /> : null}
      {tab === "fees" ? <SchoolFeesScreen snapshot={snapshot} onChanged={reload} /> : null}
      {tab === "exams" ? <SchoolExamsScreen snapshot={snapshot} onChanged={reload} /> : null}
      {tab === "timetable" ? <SchoolTimetableScreen snapshot={snapshot} onChanged={reload} /> : null}
      {tab === "library" ? <SchoolLibraryScreen snapshot={snapshot} onChanged={reload} /> : null}
      {tab === "transport" ? <SchoolTransportScreen snapshot={snapshot} onChanged={reload} /> : null}
      {tab === "payroll" ? <SchoolPayrollScreen snapshot={snapshot} onChanged={reload} /> : null}
      {tab === "settings" ? <SchoolSettingsScreen snapshot={snapshot} onChanged={reload} /> : null}
    </div>
  );
}
