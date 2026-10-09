import { NextResponse } from "next/server";
import { requireModuleAccess } from "@/lib/auth/module-access";
import { hasPermission } from "@/lib/auth/permissions";
import { getChatAttachment, resolveChatViewer, SchoolChatError } from "@/modules/school/chat-service";

/** Serves a chat attachment only to a current member of its chat. */
export async function GET(_request: Request, { params }: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await params;
  if (!/^[a-z0-9]{20,40}$/i.test(messageId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const tenant = await requireModuleAccess("school");
  const viewer = await resolveChatViewer(tenant, (permission) => hasPermission(tenant, permission));
  if (!viewer) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const file = await getChatAttachment(viewer, messageId);
    const inline = file.mimeType.startsWith("image/");
    return new NextResponse(new Uint8Array(file.bytes), {
      headers: {
        "Content-Type": file.mimeType,
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${file.fileName.replace(/["\\\r\n]/g, "_")}"`,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox",
      },
    });
  } catch (error) {
    if (error instanceof SchoolChatError) return NextResponse.json({ error: "Not found" }, { status: 404 });
    throw error;
  }
}
