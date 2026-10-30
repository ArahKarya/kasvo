import { describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { db } from "@/server/db";
import { createAccount } from "@/server/domain/accounts";
import { addAttachment, getAttachment, listAttachments, removeAttachment } from "@/server/domain/attachments";
import { findTransactions } from "@/server/domain/transaction-queries";
import { createToken, verifyToken } from "@/server/domain/tokens";
import { deleteTransactions, recordTransaction, restoreTransactions } from "@/server/domain/transactions";
import { contextFor } from "@/mcp/context";
import { createKasvoServer } from "@/mcp/server";
import { buildPdf, tablePage } from "../fixtures/pdf-builder";
import { makeUser } from "./helpers";

/** A real 1×1 PNG. */
const PNG = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64"));

async function expense(actor: Awaited<ReturnType<typeof makeUser>>) {
  const { id: accountId } = await createAccount(actor, { name: "BCA", type: "BANK", openingDate: "2026-10-01" });
  return (await recordTransaction(actor, { accountId, kind: "EXPENSE", amount: "45rb", bookedOn: "2026-10-28", description: "Indomaret" })).id;
}

describe("attachments", () => {
  it("stores photos and PDFs by their real type, lists them, and counts them on the list", async () => {
    const actor = await makeUser();
    const tx = await expense(actor);
    const photo = await addAttachment(actor, { transactionId: tx, fileName: "struk.HEIC.png", bytes: PNG });
    expect(photo).toMatchObject({ mimeType: "image/png", fileName: "struk.HEIC.png", size: PNG.length });
    const pdf = await addAttachment(actor, { transactionId: tx, fileName: "invoice", bytes: buildPdf([tablePage([[[40, "Invoice"]]])]) });
    expect(pdf).toMatchObject({ mimeType: "application/pdf", fileName: "invoice.pdf" });

    expect((await listAttachments(actor.userId, tx)).map((a) => a.fileName)).toEqual(["struk.HEIC.png", "invoice.pdf"]);
    expect(Buffer.from((await getAttachment(actor.userId, photo.id))!.data)).toEqual(Buffer.from(PNG));
    expect((await findTransactions(actor.userId, {})).items[0].attachmentCount).toBe(2);

    const audit = await db.auditLog.findMany({ where: { userId: actor.userId, action: "attachment.add" } });
    expect(audit).toHaveLength(2);
    expect(JSON.stringify(audit)).not.toContain(Buffer.from(PNG).toString("base64"));
  });

  it("rejects disguised, oversized, and surplus files, and other people's transactions", async () => {
    const actor = await makeUser();
    const tx = await expense(actor);
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    await expect(addAttachment(actor, { transactionId: tx, fileName: "struk.jpg", bytes: svg })).rejects.toMatchObject({ reason: "attachment_type" });
    const big = new Uint8Array(5 * 1024 * 1024 + 1);
    big.set([0xff, 0xd8, 0xff]);
    await expect(addAttachment(actor, { transactionId: tx, bytes: big })).rejects.toMatchObject({ reason: "attachment_too_large" });
    for (let i = 0; i < 5; i++) await addAttachment(actor, { transactionId: tx, bytes: PNG });
    await expect(addAttachment(actor, { transactionId: tx, bytes: PNG })).rejects.toMatchObject({ reason: "attachment_limit" });

    const stranger = await makeUser();
    await expect(addAttachment(stranger, { transactionId: tx, bytes: PNG })).rejects.toMatchObject({ reason: "not_found" });
    const [first] = await listAttachments(actor.userId, tx);
    expect(await getAttachment(stranger.userId, first.id)).toBeNull();
    await expect(removeAttachment(stranger, first.id)).rejects.toMatchObject({ reason: "not_found" });
  });

  it("keeps attachments through delete and undo, and refuses new ones on a deleted transaction", async () => {
    const actor = await makeUser();
    const tx = await expense(actor);
    await addAttachment(actor, { transactionId: tx, bytes: PNG });
    await deleteTransactions(actor, [tx]);
    await expect(addAttachment(actor, { transactionId: tx, bytes: PNG })).rejects.toMatchObject({ reason: "not_found" });
    await restoreTransactions(actor, [tx]);
    expect(await listAttachments(actor.userId, tx)).toHaveLength(1);
  });

  it("lets an agent attach, read the photo, and remove it only after confirmation", async () => {
    const actor = await makeUser();
    const tx = await expense(actor);
    const { token } = await createToken(actor, { name: "agent", scopes: ["destructive"] });
    const server = createKasvoServer(await contextFor((await verifyToken(token))!));
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const client = new Client({ name: "vitest", version: "0" });
    await client.connect(clientSide);
    const text = (r: Awaited<ReturnType<typeof client.callTool>>) => JSON.parse((r.content as { text: string }[])[0].text);

    const added = text(await client.callTool({ name: "kasvo_attach_file", arguments: { transactionId: tx, fileBase64: Buffer.from(PNG).toString("base64"), fileName: "struk.png" } }));
    expect(added).toMatchObject({ fileName: "struk.png", type: "image/png", addedBy: "agent" });

    const opened = await client.callTool({ name: "kasvo_get_attachment", arguments: { id: added.id } });
    const image = (opened.content as { type: string; data?: string; mimeType?: string }[])[1];
    expect(image).toMatchObject({ type: "image", mimeType: "image/png", data: Buffer.from(PNG).toString("base64") });

    const found = text(await client.callTool({ name: "kasvo_find_transactions", arguments: {} }));
    expect(found.transactions[0].attachments).toBe(1);

    const pending = text(await client.callTool({ name: "kasvo_remove_attachment", arguments: { attachmentId: added.id } }));
    expect(pending.summary).toContain("cannot be undone");
    expect(await listAttachments(actor.userId, tx)).toHaveLength(1);
    await client.callTool({ name: "kasvo_confirm", arguments: { pendingId: pending.pendingId } });
    expect(await listAttachments(actor.userId, tx)).toHaveLength(0);
  });
});
