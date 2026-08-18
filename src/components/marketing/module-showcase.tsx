import { SchoolModuleShowcase } from "@/components/marketing/module-showcases/school";

const MODULE_SHOWCASES: Partial<Record<string, React.ComponentType>> = {
  school: SchoolModuleShowcase,
};

/** Renders an illustrative in-app preview for modules that have one configured; otherwise renders nothing. */
export function ModuleShowcase({ moduleKey }: { moduleKey: string }) {
  const Showcase = MODULE_SHOWCASES[moduleKey];
  if (!Showcase) return null;
  return (
    <div className="mx-auto max-w-6xl px-6 py-20">
      <Showcase />
    </div>
  );
}
