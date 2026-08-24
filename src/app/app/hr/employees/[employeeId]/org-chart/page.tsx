import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { getOrgChartTree } from "@/modules/hr/service";
import { OrgChartNode } from "./org-chart-node";

export default async function HrEmployeeOrgChartPage({ params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params;
  const tenant = await requireModuleAccess("hr");
  const tree = await getOrgChartTree(tenant.organizationId, employeeId);
  if (!tree) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/app/hr/employees/${employeeId}`} className="text-sm text-muted-foreground hover:underline">Back to profile</Link>
        <h1 className="mt-1 text-xl font-semibold">Organization chart</h1>
      </div>
      <div className="overflow-x-auto pb-4">
        <div className="flex min-w-fit justify-center px-6 pt-4">
          <OrgChartNode node={tree} currentId={employeeId} />
        </div>
      </div>
    </div>
  );
}
