import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { db } from "@/server/db";
import { createAccount, getAccount } from "@/server/domain/accounts";
import { commitImport, stageFile, stagePdf } from "@/server/domain/import/service";
import { createToken, verifyToken } from "@/server/domain/tokens";
import { contextFor } from "@/mcp/context";
import { createKasvoServer } from "@/mcp/server";
import { bcaStatementPdf, gopayHistoryPdf, scannedLikePdf } from "../fixtures/statements/pdf-statements";
import { makeUser } from "./helpers";

const PASSWORD = "01011990";

describe("PDF statement import", () => {
  it("needs the right password, stages rows, and never stores the password", async () => {
    const actor = await makeUser();
    const { id: accountId } = await createAccount(actor, { name: "BCA", type: "BANK", openingBalance: "10jt", openingDate: "2026-09-30" });
    const bytes = bcaStatementPdf(PASSWORD);

    await expect(stagePdf(actor, { accountId, bytes })).rejects.toMatchObject({ reason: "pdf_password" });
    await expect(stagePdf(actor, { accountId, bytes, password: "salah" })).rejects.toMatchObject({ reason: "pdf_password_wrong" });

    const staged = await stagePdf(actor, { accountId, bytes, password: PASSWORD, fileName: "estatement.pdf" });
    expect(staged).toMatchObject({ status: "STAGED", format: "bca pdf", rowCount: 4, duplicateCount: 0, unsigned: 0 });
    await commitImport(actor, staged.batchId);
    expect((await getAccount(actor.userId, accountId)).balance).toBe(20_399_500n);

    const again = await stagePdf(actor, { accountId, bytes: bcaStatementPdf(PASSWORD), password: PASSWORD });
    expect(again).toMatchObject({ rowCount: 4, duplicateCount: 4 });

    const batches = await db.importBatch.findMany({ where: { userId: actor.userId } });
    const audit = await db.auditLog.findMany({ where: { userId: actor.userId } });
    expect(JSON.stringify([batches, audit])).not.toContain(PASSWORD);
  });

  it("explains scans and non-PDF bytes, and reads e-wallet histories", async () => {
    const actor = await makeUser();
    const { id: accountId } = await createAccount(actor, { name: "GoPay", type: "EWALLET", openingDate: "2026-09-30" });
    await expect(stagePdf(actor, { accountId, bytes: scannedLikePdf() })).rejects.toMatchObject({ reason: "pdf_no_text" });
    await expect(stagePdf(actor, { accountId, bytes: new TextEncoder().encode("not a pdf") })).rejects.toMatchObject({ reason: "pdf_unreadable" });

    const gopay = await stagePdf(actor, { accountId, bytes: gopayHistoryPdf() });
    expect(gopay).toMatchObject({ format: "gopay pdf", rowCount: 3, skippedLines: 1 });

    const dana = await stageFile(actor, { accountId, text: readFileSync("tests/fixtures/statements/dana.csv", "utf8") });
    expect(dana).toMatchObject({ format: "dana", rowCount: 3 });
  });

  it("accepts a PDF through MCP as base64", async () => {
    const actor = await makeUser();
    await createAccount(actor, { name: "BCA", type: "BANK", openingDate: "2026-09-30" });
    const { token } = await createToken(actor, { name: "agent", scopes: ["write"] });
    const server = createKasvoServer(await contextFor((await verifyToken(token))!));
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const client = new Client({ name: "vitest", version: "0" });
    await client.connect(clientSide);

    const pdfBase64 = Buffer.from(bcaStatementPdf(PASSWORD)).toString("base64");
    const locked = await client.callTool({ name: "kasvo_stage_import", arguments: { account: "BCA", pdfBase64 } });
    expect(locked.isError).toBe(true);
    expect((locked.content as { text: string }[])[0].text).toContain("password");

    const ok = await client.callTool({ name: "kasvo_stage_import", arguments: { account: "BCA", pdfBase64, password: PASSWORD } });
    expect(ok.structuredContent).toMatchObject({ status: "STAGED", rowCount: 4 });
  });
});
