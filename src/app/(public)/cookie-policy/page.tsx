import { createPublicMetadata } from "@/lib/seo";

export const metadata = createPublicMetadata({
  title: "Cookie Policy",
  description: "How Rock Frost Technologies uses essential cookies, optional analytics, and performance measurements.",
  path: "/cookie-policy",
  keywords: ["Rock Frost cookie policy", "website privacy choices"],
});

const sections = [
  {
    title: "Essential cookies",
    body: "These support secure sign-in, account sessions, organization selection, security controls, and your saved privacy choice. They are required for the service to work and cannot be disabled through the cookie banner.",
  },
  {
    title: "Optional analytics",
    body: "If you accept optional analytics, Vercel Web Analytics helps us understand page usage and Vercel Speed Insights measures website performance. These tools do not load before you accept. Choosing Essential only leaves them disabled.",
  },
  {
    title: "Changing your choice",
    body: "Use Cookie settings in the website footer at any time. Your choice is stored for up to 180 days. You can also clear cookies in your browser, after which we will ask again.",
  },
  {
    title: "Your organization data",
    body: "A cookie preference is separate from the operational information that customers store in Rock Frost Business Suite. Access to organization data remains controlled by authentication, permissions, module boundaries, and tenant isolation.",
  },
] as const;

export default function CookiePolicyPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-16 sm:py-20">
      <p className="text-sm font-medium text-primary">Privacy and transparency</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight">Cookie policy</h1>
      <p className="mt-5 max-w-3xl leading-7 text-muted-foreground">
        This policy explains the cookies and similar technologies used across Rock Frost Technologies websites and Rock Frost Business Suite. It was last updated on 15 August 2026.
      </p>
      <div className="mt-12 space-y-10">
        {sections.map((section) => (
          <section key={section.title}>
            <h2 className="text-xl font-semibold tracking-tight">{section.title}</h2>
            <p className="mt-3 leading-7 text-muted-foreground">{section.body}</p>
          </section>
        ))}
      </div>
      <section className="mt-12 border-t pt-8">
        <h2 className="text-xl font-semibold tracking-tight">Contact</h2>
        <p className="mt-3 leading-7 text-muted-foreground">
          Questions about this policy can be sent through our contact page. Organizations should obtain their own legal advice for sector-specific privacy and consent duties.
        </p>
      </section>
    </div>
  );
}
