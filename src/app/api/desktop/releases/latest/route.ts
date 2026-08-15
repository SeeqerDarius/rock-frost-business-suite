const RELEASE_MANIFEST_URL =
  "https://github.com/SeeqerDarius/rock-frost-business-suite/releases/latest/download/latest.json";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch(RELEASE_MANIFEST_URL, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) return new Response(null, { status: 204, headers: noStoreHeaders() });

    const manifest: unknown = await response.json();
    if (!isReleaseManifest(manifest)) {
      return Response.json(
        { error: "The desktop release manifest is invalid." },
        { status: 502, headers: noStoreHeaders() },
      );
    }

    return Response.json(manifest, { headers: noStoreHeaders() });
  } catch {
    return new Response(null, { status: 204, headers: noStoreHeaders() });
  }
}

function noStoreHeaders() {
  return { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" };
}

function isReleaseManifest(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const manifest = value as Record<string, unknown>;
  if (typeof manifest.version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(manifest.version)) return false;
  if (!manifest.platforms || typeof manifest.platforms !== "object") return false;

  const platforms = Object.values(manifest.platforms as Record<string, unknown>);
  if (platforms.length === 0) return false;
  return platforms.every((platform) => {
    if (!platform || typeof platform !== "object") return false;
    const entry = platform as Record<string, unknown>;
    if (typeof entry.signature !== "string" || entry.signature.length < 32) return false;
    if (typeof entry.url !== "string") return false;
    try {
      return new URL(entry.url).protocol === "https:";
    } catch {
      return false;
    }
  });
}
