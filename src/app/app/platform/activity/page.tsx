import { Activity } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { db } from "@/lib/db";

const ACTION_LABELS: Record<string, string> = {
  "member.invited": "invited a member",
  "module.enabled": "enabled a module",
  "module.disabled": "disabled a module",
};

export default async function PlatformActivityPage() {
  const entries = await db.auditLog.findMany({
    include: { organization: true, user: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <div className="space-y-6">
      <PageHeader title="System activity" description="Platform-wide audit trail and service health." />

      {entries.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No activity recorded yet"
          description="Actions like inviting members or enabling modules will appear here as they happen."
        />
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-start justify-between gap-4 rounded-lg border p-3">
              <div>
                <p className="text-sm">
                  <span className="font-medium">{entry.user?.name ?? entry.user?.email ?? "System"}</span>{" "}
                  {ACTION_LABELS[entry.action] ?? entry.action}
                  {" "}in <span className="font-medium">{entry.organization.name}</span>
                </p>
                <p className="text-xs text-muted-foreground">{entry.entityName}{entry.entityId ? ` · ${entry.entityId}` : ""}</p>
              </div>
              <p className="shrink-0 text-xs text-muted-foreground">{entry.createdAt.toLocaleString()}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
