import { redirect } from "next/navigation";
import { Wrench, Lock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { getServerAuthSession } from "@/lib/auth/session";
import { getFleetMechanicWorkspace } from "@/modules/fleet/mechanic-workspace";
import { scheduleAssignedRepair } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to access the mechanic workspace.",
  "missing-fields": "A scheduled repair date is required.",
  "invalid-input": "Enter a valid date.",
  "not-found": "That request is no longer assigned to you.",
};

const PROGRESS_LABELS: Record<string, string> = {
  REPORTED: "Reported",
  REVIEWING: "Reviewing",
  APPROVED: "Approved",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const PROGRESS_BADGE: Record<string, "default" | "outline" | "destructive" | "secondary"> = {
  APPROVED: "secondary",
  IN_PROGRESS: "secondary",
  COMPLETED: "default",
  CANCELLED: "destructive",
};

export default async function FleetMechanicPortalPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("fleet");
  if (!hasPermission(tenant, PERMISSIONS.FLEET_MECHANIC_SELF_SERVICE)) {
    return <div className="space-y-6"><PageHeader title="Mechanic Workspace" description="Requests assigned to you." /><EmptyState icon={Lock} title="Mechanic access required" description="Your role does not include access to the mechanic workspace." /></div>;
  }
  const session = await getServerAuthSession();
  if (!session?.user?.id) redirect("/login");

  const workspace = await getFleetMechanicWorkspace(tenant.organizationId, session.user.id);
  if (!workspace) {
    return <div className="space-y-6"><PageHeader title="Mechanic Workspace" description="Requests assigned to you." /><EmptyState icon={Wrench} title="No mechanic profile linked" description="Ask Fleet management to link your login to your mechanic roster entry." /></div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Mechanic Workspace" description={`Welcome, ${workspace.mechanic.name}. Maintenance requests assigned to you.`} />

      {saved ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">Saved.</div>
      ) : null}
      {error && ERROR_MESSAGES[error] ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{ERROR_MESSAGES[error]}</div>
      ) : null}

      <Tabs defaultValue="assigned">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="assigned">Assigned to me</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>

        <TabsContent value="assigned" className="mt-4 space-y-4">
          {workspace.assigned.length === 0 ? (
            <EmptyState icon={Wrench} title="Nothing assigned right now" description="Maintenance requests a Fleet manager assigns to you will appear here." />
          ) : workspace.assigned.map((request) => (
            <Card key={request.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{request.vehicle.assetTag} - {request.vehicle.plateNumber}</CardTitle>
                    <CardDescription>{request.faultDescription}</CardDescription>
                  </div>
                  <Badge variant={PROGRESS_BADGE[request.progressStatus]}>{PROGRESS_LABELS[request.progressStatus]}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  {request.scheduledRepairAt
                    ? `Scheduled for ${request.scheduledRepairAt.toLocaleDateString()}`
                    : "No repair date scheduled yet."}
                </p>
                <form action={scheduleAssignedRepair} className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={request.id} />
                  <div className="space-y-1">
                    <Label htmlFor={`scheduledRepairAt-${request.id}`}>Scheduled repair date</Label>
                    <Input id={`scheduledRepairAt-${request.id}`} name="scheduledRepairAt" type="date" defaultValue={request.scheduledRepairAt ? request.scheduledRepairAt.toISOString().slice(0, 10) : ""} required />
                  </div>
                  <Button type="submit" size="sm">{request.scheduledRepairAt ? "Update date" : "Schedule repair"}</Button>
                </form>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-4">
          {workspace.history.length === 0 ? (
            <EmptyState icon={Wrench} title="No completed work yet" description="Requests you finish or that get cancelled will appear here." />
          ) : workspace.history.map((request) => (
            <Card key={request.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{request.vehicle.assetTag} - {request.vehicle.plateNumber}</CardTitle>
                    <CardDescription>{request.faultDescription}</CardDescription>
                  </div>
                  <Badge variant={PROGRESS_BADGE[request.progressStatus]}>{PROGRESS_LABELS[request.progressStatus]}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  {request.completedAt ? `Completed ${request.completedAt.toLocaleDateString()}` : "No completion date recorded."}
                </p>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
