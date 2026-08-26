import { ImageResponse } from "next/og";

export const alt = "Rock Frost Business Suite: modular business management software";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px",
        color: "white",
        background: "linear-gradient(135deg, #07111f 0%, #0b2a3d 55%, #087ca7 100%)",
      }}
    >
      <div style={{ display: "flex", fontSize: 26, letterSpacing: 2, color: "#7dd3fc" }}>
        ROCK FROST TECHNOLOGIES
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        <div style={{ display: "flex", maxWidth: 950, fontSize: 68, fontWeight: 700, lineHeight: 1.05 }}>
          One platform for every system your business runs on.
        </div>
        <div style={{ display: "flex", fontSize: 28, color: "#dbeafe" }}>
          Fleet · Installment · CRM · Inventory · Accounting · HR · Payroll · POS
        </div>
      </div>
      <div style={{ display: "flex", fontSize: 24 }}>rockfrostgroup.com</div>
    </div>,
    size,
  );
}

