import { Lock, Sparkles, X, Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/feedback/empty-state";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { listSkillTypes } from "@/modules/hr/service";
import { addSkillType, removeSkillType, addSkill, removeSkill } from "./actions";

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: "You don't have permission to manage HR configuration.",
  "missing-fields": "A name is required.",
  duplicate: "That name is already in use.",
  "not-found": "That item could not be found.",
};

export default async function HrConfigurationPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { saved, error } = await searchParams;
  const tenant = await requireModuleAccess("hr");

  if (!hasPermission(tenant, PERMISSIONS.HR_SETTINGS_MANAGE)) {
    return (
      <div className="space-y-6">
        <PageHeader title="Configuration" description="Master data for Human Resources." />
        <EmptyState icon={Lock} title="You don't have access to this page" description="HR configuration is limited to roles with settings permissions." />
      </div>
    );
  }

  const skillTypes = await listSkillTypes(tenant.organizationId);

  return (
    <div className="space-y-6">
      <PageHeader title="Configuration" description="Master data for Human Resources." />

      {saved ? (
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">Saved.</div>
      ) : null}
      {error && ERROR_MESSAGES[error] ? (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{ERROR_MESSAGES[error]}</div>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="size-5 text-muted-foreground" />
            <CardTitle>Skills</CardTitle>
          </div>
          <CardDescription>Skill types and the skills within them, assignable to employees from their profile.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {skillTypes.length === 0 ? (
            <p className="text-sm text-muted-foreground">No skill types yet. Add one to start building your skills catalogue.</p>
          ) : (
            skillTypes.map((skillType) => (
              <div key={skillType.id} className="space-y-2 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{skillType.name}</h3>
                  <form action={removeSkillType}>
                    <input type="hidden" name="id" value={skillType.id} />
                    <Button type="submit" size="sm" variant="ghost">Delete type</Button>
                  </form>
                </div>
                {skillType.skills.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {skillType.skills.map((skill) => (
                      <form key={skill.id} action={removeSkill} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs">
                        <span>{skill.name}</span>
                        <input type="hidden" name="id" value={skill.id} />
                        <button type="submit" className="text-muted-foreground hover:text-destructive" aria-label={`Remove ${skill.name}`}>
                          <X className="size-3" />
                        </button>
                      </form>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No skills in this type yet.</p>
                )}
                <form action={addSkill} className="flex gap-2">
                  <input type="hidden" name="skillTypeId" value={skillType.id} />
                  <Input name="name" placeholder="New skill" className="h-8 max-w-xs" />
                  <Button type="submit" size="sm" variant="outline">Add skill</Button>
                </form>
              </div>
            ))
          )}
          <form action={addSkillType} className="flex gap-2">
            <Input name="name" placeholder="New skill type (e.g. Languages)" className="h-8 max-w-xs" />
            <Button type="submit" size="sm" variant="outline"><Plus />Add skill type</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
