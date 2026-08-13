import Link from "next/link";
import {
  ArrowUpRight,
  Blocks,
  CheckCircle2,
  CloudCog,
  Code2,
  Fingerprint,
  Landmark,
  LockKeyhole,
  Network,
  Scale,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createPublicMetadata } from "@/lib/seo";
import { PublicHero } from "@/components/marketing/public-hero";

export const metadata = createPublicMetadata({
  title: "Technology Company Ghana | Rock Frost Technologies",
  description: "Rock Frost Technologies designs premium business software, e-commerce platforms, websites, integrations, cloud systems, and tailored digital solutions for ambitious organizations.",
  path: "/company",
  keywords: ["software development company Ghana", "ecommerce website development Ghana", "IT solutions company Ghana", "custom business software Africa", "Rock Frost Technologies"],
});

const capabilities = [
  { icon: Blocks, title: "Business platforms", text: "Purpose-built operational systems, internal portals, dashboards, workflow automation, reporting, and multi-organization software." },
  { icon: ShoppingBag, title: "Digital commerce", text: "Premium e-commerce experiences, catalogues, checkout journeys, payments, order operations, and the integrations behind them." },
  { icon: Code2, title: "Web and product engineering", text: "Corporate websites, customer portals, web applications, APIs, and digital products engineered for speed, clarity, and maintainability." },
  { icon: Network, title: "Integrations and automation", text: "Connected workflows across payments, email, reporting, business data, third-party services, and existing systems." },
  { icon: CloudCog, title: "Cloud and modernization", text: "Secure cloud delivery, legacy-process modernization, data migration, deployment pipelines, monitoring, and resilient operations." },
  { icon: Sparkles, title: "Technology advisory", text: "Discovery, product strategy, solution architecture, process redesign, and a practical roadmap from business problem to dependable technology." },
] as const;

const principles = [
  "Tenant and module boundaries that prevent unrelated business data from being mixed",
  "Role-based access, auditable activity, secure authentication, and optional two-factor authentication",
  "Validated backups, controlled restoration, operational monitoring, and disciplined production releases",
  "Data minimization, purpose limitation, retention awareness, and privacy-conscious product design",
] as const;

export default function CompanyPage() {
  return <>
    <PublicHero eyebrow="Rock Frost Technologies · Ghana" title="Technology engineered around the way serious organizations work." description="We design and deliver high-value software, digital commerce, websites, cloud platforms, integrations, and tailored IT solutions. Rock Frost Business Suite is one expression of a broader capability: turning complex operations into technology that feels precise, secure, and effortless." actions={<><Button size="lg" nativeButton={false} render={<Link href="/contact?intent=demo" />}>Discuss a project</Button><Button size="lg" variant="outline" nativeButton={false} render={<Link href="/solutions" />}>Explore our platform</Button></>}>
      <div className="public-panel rounded-2xl p-7 sm:p-9"><p className="text-sm font-medium text-primary">Built for demanding operations</p><h2 className="mt-4 text-2xl font-semibold tracking-tight">One accountable partner from strategy to production.</h2><div className="mt-8 space-y-5">{[['15','specialized business modules'],['Secure','tenant-isolated architecture'],['Continuous','updates, monitoring and support']].map(([value,label]) => <div key={label} className="flex items-end justify-between gap-6 border-t pt-5 first:border-t-0 first:pt-0"><p className="text-2xl font-semibold tracking-tight">{value}</p><p className="max-w-44 text-right text-sm text-muted-foreground">{label}</p></div>)}</div></div>
    </PublicHero>

    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="max-w-3xl"><p className="text-sm font-medium text-primary">What we build</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">Far more than management software.</h2><p className="mt-4 text-muted-foreground">We select the right architecture for the problem rather than forcing every client into the same product. Engagements can range from a focused commercial website to an organization-wide operating platform.</p></div>
      <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{capabilities.map((item) => <Card key={item.title} className="bg-card/70"><CardHeader><div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><item.icon className="size-5" /></div><CardTitle>{item.title}</CardTitle><CardDescription className="leading-6">{item.text}</CardDescription></CardHeader></Card>)}</div>
    </section>

    <section className="border-y bg-zinc-950 text-zinc-50 dark:bg-zinc-900">
      <div className="mx-auto max-w-6xl px-6 py-20">
        <div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr] lg:items-start"><div><p className="text-sm font-medium text-blue-300">Selected work</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">Digital products built for real organizations.</h2><p className="mt-4 leading-7 text-zinc-400">Our portfolio spans proprietary platforms and commissioned client solutions. Each engagement is shaped around the client’s identity, customers, workflows, and commercial objectives.</p></div>
          <div className="space-y-4">
            <PortfolioCard icon={Landmark} title="Rock Frost Business Suite" type="Proprietary SaaS platform" description="A secure modular operating platform covering fleet, installment sales, CRM, inventory, accounting, HR, payroll, procurement, projects, analytics, POS, hotel, school, pharmacy, and hospital operations." href="/modules" />
            <PortfolioCard icon={Network} title="HR Network / Connect" type="Professional network website" description="A digital presence created for an HR-focused professional community, supporting visibility, connection, events, and stakeholder engagement." />
            <PortfolioCard icon={ShoppingBag} title="Blend & Beam" type="E-commerce website" description="An online retail experience for beauty, salon, barbering, and lifestyle products, including product discovery, catalogue organization, pricing, and commerce journeys." href="https://blendandbeam.com/" external />
            <PortfolioCard icon={Code2} title="Bespoke technology solutions" type="Confidential and commissioned work" description="Websites, internal tools, operational systems, integrations, automation, and technology support delivered for organizations with requirements beyond an off-the-shelf product." />
          </div>
        </div>
      </div>
    </section>

    <section className="mx-auto max-w-6xl px-6 py-20">
      <div className="grid gap-12 lg:grid-cols-2">
        <div><p className="text-sm font-medium text-primary">Responsible technology</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">Privacy, security, and legal responsibility are designed in.</h2><p className="mt-4 leading-7 text-muted-foreground">We engineer our systems to support responsible processing of personal data and our clients’ compliance programmes. In Ghana, this includes alignment with the principles and obligations of the <a className="font-medium text-foreground underline underline-offset-4" href="https://ghalii.org/akn/gh/act/2012/843/eng%402012-05-18" target="_blank" rel="noreferrer">Data Protection Act, 2012 (Act 843)</a> and guidance from the <a className="font-medium text-foreground underline underline-offset-4" href="https://dataprotection.org.gh/" target="_blank" rel="noreferrer">Data Protection Commission</a>.</p><p className="mt-4 text-sm leading-6 text-muted-foreground">Technology is only one part of compliance. Each client remains responsible for its lawful basis, notices, consent where required, governance, retention decisions, regulatory registration, staff practices, and sector-specific obligations. We work with clients and their legal or compliance advisers to configure the technology appropriately.</p></div>
        <Card className="border-primary/20"><CardHeader><div className="mb-3 flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary"><ShieldCheck className="size-6" /></div><CardTitle>Our engineering commitments</CardTitle><CardDescription>Controls that support trustworthy digital operations.</CardDescription></CardHeader><CardContent><ul className="space-y-4">{principles.map((principle) => <li key={principle} className="flex gap-3 text-sm leading-6"><CheckCircle2 className="mt-0.5 size-5 shrink-0 text-primary" />{principle}</li>)}</ul><div className="mt-6 grid grid-cols-3 gap-3 border-t pt-5 text-center text-xs text-muted-foreground"><div><LockKeyhole className="mx-auto mb-2 size-5 text-foreground" />Access control</div><div><Fingerprint className="mx-auto mb-2 size-5 text-foreground" />Account security</div><div><Scale className="mx-auto mb-2 size-5 text-foreground" />Responsible delivery</div></div></CardContent></Card>
      </div>
    </section>

    <section className="border-y bg-muted/30"><div className="mx-auto max-w-6xl px-6 py-20"><div className="max-w-3xl"><p className="text-sm font-medium text-primary">Why Rock Frost</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">A technology partner with product discipline.</h2></div><div className="mt-10 grid gap-8 md:grid-cols-2 lg:grid-cols-4">{[
      ['Business-first thinking','We begin with the operational and commercial outcome, then choose the technology.'],
      ['Built for ownership','Clear workflows, practical controls, documentation, and systems your team can confidently operate.'],
      ['Production accountability','Testing, monitored deployments, backups, security controls, and a disciplined release lifecycle.'],
      ['Long-term partnership','We can design, build, improve, integrate, train, and support as your organization evolves.'],
    ].map(([title,text]) => <div key={title}><h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p></div>)}</div></div></section>

    <section className="mx-auto max-w-6xl px-6 py-20"><div className="rounded-2xl bg-primary px-8 py-12 text-primary-foreground sm:px-12"><div className="max-w-3xl"><p className="text-sm font-medium text-primary-foreground/75">Build with Rock Frost</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">Bring us the problem. We will help define the right solution.</h2><p className="mt-4 leading-7 text-primary-foreground/80">Whether you need an e-commerce platform, a corporate digital presence, a custom operating system, an integration, or a complete technology roadmap, we will help define and deliver the right solution.</p><Button className="mt-7" variant="secondary" size="lg" nativeButton={false} render={<Link href="/contact" />}>Start a conversation <ArrowUpRight className="ml-2 size-4" /></Button></div></div></section>
  </>;
}

function PortfolioCard({ icon: Icon, title, type, description, href, external = false }: { icon: typeof Code2; title: string; type: string; description: string; href?: string; external?: boolean }) {
  const content = <div className="group flex gap-4 rounded-2xl border border-white/10 bg-white/[.04] p-5 transition-colors hover:bg-white/[.07]"><div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-400/10 text-blue-300"><Icon className="size-5" /></div><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{title}</h3><p className="mt-1 text-xs uppercase tracking-wider text-blue-300">{type}</p></div>{href ? <ArrowUpRight className="size-4 shrink-0 text-zinc-500 transition-colors group-hover:text-white" /> : null}</div><p className="mt-3 text-sm leading-6 text-zinc-400">{description}</p></div></div>;
  if (!href) return content;
  return external ? <a href={href} target="_blank" rel="noreferrer">{content}</a> : <Link href={href}>{content}</Link>;
}
