import Image from "next/image";

export const MODULE_SCREENSHOTS: Record<string, { src: string; alt: string }> = {
  fleet: { src: "/screenshots/modules/fleet.png", alt: "Real Fleet Management overview in Rock Frost Business Suite" },
  installment: { src: "/screenshots/modules/installment.png", alt: "Real Installment Management overview in Rock Frost Business Suite" },
  crm: { src: "/screenshots/modules/crm.png", alt: "Real Customer Relationship Management overview in Rock Frost Business Suite" },
  inventory: { src: "/screenshots/modules/inventory.png", alt: "Real Inventory and Procurement overview in Rock Frost Business Suite" },
  accounting: { src: "/screenshots/modules/accounting.png", alt: "Real Accounting overview in Rock Frost Business Suite" },
  hr: { src: "/screenshots/modules/hr.png", alt: "Real Human Resources and Payroll overview in Rock Frost Business Suite" },
  projects: { src: "/screenshots/modules/projects.png", alt: "Real Project Management overview in Rock Frost Business Suite" },
  analytics: { src: "/screenshots/modules/analytics.png", alt: "Real Analytics overview in Rock Frost Business Suite" },
  pos: { src: "/screenshots/modules/pos.png", alt: "Real Point of Sale overview in Rock Frost Business Suite" },
  hotel: { src: "/screenshots/modules/hotel.png", alt: "Real Hotel Management overview in Rock Frost Business Suite" },
  school: { src: "/screenshots/modules/school.png", alt: "Real School Management overview in Rock Frost Business Suite" },
  hostel: { src: "/screenshots/modules/hostel.png", alt: "Real Hostel Management overview in Rock Frost Business Suite" },
  pharmacy: { src: "/screenshots/modules/pharmacy.png", alt: "Real Pharmacy Management overview in Rock Frost Business Suite" },
  hospital: { src: "/screenshots/modules/hospital.png", alt: "Real Hospital Management overview in Rock Frost Business Suite" },
};

export function ModuleShowcase({ moduleKey }: { moduleKey: string }) {
  const screenshot = MODULE_SCREENSHOTS[moduleKey];
  if (!screenshot) return null;

  return (
    <section className="mx-auto max-w-6xl px-6 py-16" aria-labelledby={`${moduleKey}-screenshot-title`}>
      <div className="mb-6 max-w-3xl">
        <p className="public-eyebrow">Inside the real system</p>
        <h2 id={`${moduleKey}-screenshot-title`} className="mt-2 text-2xl font-semibold tracking-tight">
          See the workspace your team will use
        </h2>
        <p className="mt-3 leading-7 text-muted-foreground">
          This is an authenticated Rock Frost workspace using test records. It is a real product screen, not a concept mockup.
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border bg-background shadow-sm">
        <Image src={screenshot.src} alt={screenshot.alt} width={1265} height={523} sizes="(min-width: 1152px) 1104px, calc(100vw - 48px)" className="h-auto w-full" />
      </div>
    </section>
  );
}
