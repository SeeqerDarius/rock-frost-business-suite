import { Lock, History } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/currency";
import { listSessions } from "@/modules/pos/service";

function formatDateTime(value: Date | null) {
  return value ? new Date(value).toLocaleString() : "-";
}

export default async function PosSessionsPage() {
  const tenant = await requireModuleAccess("pos");

  if (!hasPermission(tenant, PERMISSIONS.POS_REPORTS_VIEW)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Sessions" description="Every till session opened across every register." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="Session history is limited to roles with reporting permissions." />
      </div>
    );
  }

  const sessions = await listSessions(tenant.organizationId);
  const money = (value: Parameters<typeof formatMoney>[0]) => formatMoney(value, tenant.organization.currency);

  return (
    <div className="space-y-6">
      <PageHeader title="Sessions" description="Every till session opened across every register, open and closed." />

      {sessions.length === 0 ? (
        <EmptyState icon={History} title="No sessions yet" description="Sessions opened on the Registers page will appear here." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Register</TableHead>
              <TableHead>Opened</TableHead>
              <TableHead>Opened by</TableHead>
              <TableHead>Closed</TableHead>
              <TableHead>Opening float ({tenant.organization.currency})</TableHead>
              <TableHead>Closing cash ({tenant.organization.currency})</TableHead>
              <TableHead>Variance ({tenant.organization.currency})</TableHead>
              <TableHead>Sales</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sessions.map((session) => (
              <TableRow key={session.id}>
                <TableCell className="font-medium">{session.register.name}</TableCell>
                <TableCell className="text-muted-foreground">{formatDateTime(session.openedAt)}</TableCell>
                <TableCell className="text-muted-foreground">{session.openedBy?.name ?? "-"}</TableCell>
                <TableCell className="text-muted-foreground">{formatDateTime(session.closedAt)}</TableCell>
                <TableCell>{money(session.openingFloat)}</TableCell>
                <TableCell>{session.closingCash !== null ? money(session.closingCash) : "-"}</TableCell>
                <TableCell className={session.cashVariance !== null && Number(session.cashVariance) !== 0 ? "text-destructive" : "text-muted-foreground"}>
                  {session.cashVariance !== null ? money(session.cashVariance) : "-"}
                </TableCell>
                <TableCell className="text-muted-foreground">{session.sales.length}</TableCell>
                <TableCell>
                  <Badge variant={session.status === "OPEN" ? "secondary" : "default"}>{session.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
