import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { getOrgChartTree } from "@/modules/hr/service";

interface TreeNode {
  id: string;
  fullName: string;
  jobTitle: string | null;
  photoData: string | null;
  status: string;
  children: TreeNode[];
}

function Node({ node, currentId }: { node: TreeNode; currentId: string }) {
  return (
    <li>
      <Link
        href={`/app/hr/employees/${node.id}`}
        className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm ${node.id === currentId ? "border-primary bg-primary/10 font-medium" : "hover:bg-secondary/50"}`}
      >
        <span>{node.fullName}</span>
        {node.jobTitle ? <span className="text-xs text-muted-foreground">{node.jobTitle}</span> : null}
      </Link>
      {node.children.length > 0 ? (
        <ul className="mt-2 ml-6 space-y-2 border-l pl-4">
          {node.children.map((child) => <Node key={child.id} node={child} currentId={currentId} />)}
        </ul>
      ) : null}
    </li>
  );
}

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
      <ul className="space-y-2">
        <Node node={tree} currentId={employeeId} />
      </ul>
    </div>
  );
}
