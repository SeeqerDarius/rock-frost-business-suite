import { useApp } from "@/state/AppProvider";
import { useSchoolSnapshot } from "@/modules/school/school-data";
import { SchoolOverviewScreen } from "@/modules/school/screens/SchoolOverviewScreen";
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

/**
 * School's own multi-screen mini-app, mirroring PosModuleShell's structure.
 * Screen selection lives in the sidebar (AppSidebar.tsx), mirroring the web
 * app's persistent left-nav pattern; this component only owns the
 * snapshot/reload wiring and renders whichever screen is active.
 */
export function SchoolModuleShell({ screen }: { screen: string }) {
  const { db } = useApp();
  const { snapshot, reload } = useSchoolSnapshot(db);

  switch (screen) {
    case "setup":
      return <SchoolAcademicSetupScreen snapshot={snapshot} onChanged={reload} />;
    case "students":
      return <SchoolStudentsScreen snapshot={snapshot} onChanged={reload} />;
    case "enrollment":
      return <SchoolEnrollmentScreen snapshot={snapshot} onChanged={reload} />;
    case "attendance":
      return <SchoolAttendanceScreen snapshot={snapshot} onChanged={reload} />;
    case "fees":
      return <SchoolFeesScreen snapshot={snapshot} onChanged={reload} />;
    case "exams":
      return <SchoolExamsScreen snapshot={snapshot} onChanged={reload} />;
    case "timetable":
      return <SchoolTimetableScreen snapshot={snapshot} onChanged={reload} />;
    case "library":
      return <SchoolLibraryScreen snapshot={snapshot} onChanged={reload} />;
    case "transport":
      return <SchoolTransportScreen snapshot={snapshot} onChanged={reload} />;
    case "payroll":
      return <SchoolPayrollScreen snapshot={snapshot} onChanged={reload} />;
    case "settings":
      return <SchoolSettingsScreen snapshot={snapshot} onChanged={reload} />;
    default:
      return <SchoolOverviewScreen snapshot={snapshot} />;
  }
}
