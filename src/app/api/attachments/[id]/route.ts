import { currentUser } from "@/server/auth";
import { getAttachment } from "@/server/domain/attachments";

/**
 * Serves an attachment to its owner only (session cookie). The stored type was sniffed at upload,
 * nosniff stops the browser second-guessing it, and ?download=1 saves instead of opening.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const user = await currentUser();
  if (!user) return new Response("Not signed in", { status: 401 });
  const { id } = await params;
  const file = await getAttachment(user.id, id);
  if (!file) return new Response("Not found", { status: 404 });

  const download = new URL(request.url).searchParams.get("download") === "1";
  const name = encodeURIComponent(file.fileName);
  return new Response(Buffer.from(file.data), {
    headers: {
      "Content-Type": file.mimeType,
      "Content-Length": String(file.size),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${name}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=86400",
    },
  });
}
