import { useState } from "react";
import { useApp } from "@/state/AppProvider";
import { useSchoolSnapshot } from "@/modules/school/school-data";
import { SchoolAcademicSetupScreen } from "@/modules/school/screens/SchoolAcademicSetupScreen";

const TABS = [{ key: "setup", label: "Academic setup" }] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * School's own multi-screen mini-app, mirroring PosModuleShell's structure
 * so later School milestones (students, enrollment, attendance, fees,
 * exams, timetable, library, transport, payroll, settings) each add a tab
 * here rather than a new top-level component. Milestone 6 ships exactly
 * one tab - Academic setup - since campus/academic-year/term is the only
 * slice built so far.
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
    </div>
  );
}
