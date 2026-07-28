import { PublicHeader } from "@/components/layout/public-header";
import { PublicFooter } from "@/components/layout/public-footer";
import { JsonLd } from "@/components/seo/json-ld";
import { COMPANY_NAME, DEFAULT_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/seo";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            "@id": `${SITE_URL}/#organization`,
            name: COMPANY_NAME,
            url: SITE_URL,
            logo: `${SITE_URL}/RFG.png`,
            description: DEFAULT_DESCRIPTION,
          },
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            "@id": `${SITE_URL}/#website`,
            url: SITE_URL,
            name: SITE_NAME,
            publisher: { "@id": `${SITE_URL}/#organization` },
            inLanguage: "en-GH",
          },
        ]}
      />
      <PublicHeader />
      <main id="main-content" tabIndex={-1} className="flex-1">{children}</main>
      <PublicFooter />
    </div>
  );
}
