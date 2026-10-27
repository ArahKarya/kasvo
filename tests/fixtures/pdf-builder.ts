/**
 * Builds small synthetic statement PDFs in memory for tests, so no real (or binary) statement
 * ever lands in the repo. Text is placed cell by cell like a bank's table, and the file can be
 * protected with a user password (Standard security handler R4, AES-128) the way e-statements are.
 */
import { createCipheriv, createHash, randomBytes } from "node:crypto";

/** One piece of text at an absolute position, in points from the bottom-left corner. */
export interface PdfCell {
  x: number;
  y: number;
  text: string;
}

const PAD = Buffer.from("28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a", "hex");

const md5 = (...parts: Buffer[]): Buffer => createHash("md5").update(Buffer.concat(parts)).digest();

function rc4(key: Buffer, data: Buffer): Buffer {
  const s = Array.from({ length: 256 }, (_, i) => i);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
  }
  const out = Buffer.alloc(data.length);
  let i = 0;
  j = 0;
  for (let n = 0; n < data.length; n++) {
    i = (i + 1) & 255;
    j = (j + s[i]) & 255;
    [s[i], s[j]] = [s[j], s[i]];
    out[n] = data[n] ^ s[(s[i] + s[j]) & 255];
  }
  return out;
}

const padded = (password: string): Buffer => Buffer.concat([Buffer.from(password, "latin1"), PAD]).subarray(0, 32);

/** RC4 then 19 more passes with the key XORed by the pass number (PDF algorithms 3 and 5). */
function rc4Twenty(key: Buffer, data: Buffer): Buffer {
  let out = rc4(key, data);
  for (let i = 1; i <= 19; i++) out = rc4(Buffer.from(key.map((b) => b ^ i)), out);
  return out;
}

interface Security {
  key: Buffer;
  o: Buffer;
  u: Buffer;
  p: number;
}

function security(userPassword: string, id: Buffer): Security {
  const p = -4;
  let ownerKey = md5(padded(userPassword));
  for (let i = 0; i < 50; i++) ownerKey = md5(ownerKey);
  const o = rc4Twenty(ownerKey, padded(userPassword));

  const pBytes = Buffer.alloc(4);
  pBytes.writeInt32LE(p);
  let key = md5(padded(userPassword), o, pBytes, id);
  for (let i = 0; i < 50; i++) key = md5(key);

  const u = Buffer.concat([rc4Twenty(key, md5(PAD, id)), Buffer.alloc(16)]);
  return { key, o, u, p };
}

function encryptStream(sec: Security, objectNumber: number, data: Buffer): Buffer {
  const salt = Buffer.from([objectNumber & 255, (objectNumber >> 8) & 255, (objectNumber >> 16) & 255, 0, 0]);
  const key = md5(sec.key, salt, Buffer.from("sAlT", "latin1"));
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-128-cbc", key, iv);
  return Buffer.concat([iv, cipher.update(data), cipher.final()]);
}

const escape = (text: string): string => text.replace(/[\\()]/g, (c) => `\\${c}`);

function contentOf(cells: PdfCell[]): Buffer {
  const ops = cells.map((c) => `1 0 0 1 ${c.x} ${c.y} Tm (${escape(c.text)}) Tj`);
  return Buffer.from(`BT /F1 8 Tf\n${ops.join("\n")}\nET`, "latin1");
}

/** A landscape A4 PDF with one page per entry of `pages`. */
export function buildPdf(pages: PdfCell[][], opts: { userPassword?: string } = {}): Uint8Array<ArrayBuffer> {
  const id = randomBytes(16);
  const sec = opts.userPassword === undefined ? null : security(opts.userPassword, id);
  const fontObj = 3;
  const firstPageObj = 4;
  const objects: Buffer[] = [];
  const kids = pages.map((_, i) => `${firstPageObj + i * 2} 0 R`).join(" ");

  objects[1] = Buffer.from("<< /Type /Catalog /Pages 2 0 R >>");
  objects[2] = Buffer.from(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  objects[fontObj] = Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  pages.forEach((cells, i) => {
    const pageObj = firstPageObj + i * 2;
    const contentObj = pageObj + 1;
    objects[pageObj] = Buffer.from(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 ${fontObj} 0 R >> >> /Contents ${contentObj} 0 R >>`,
    );
    const raw = contentOf(cells);
    const body = sec ? encryptStream(sec, contentObj, raw) : raw;
    objects[contentObj] = Buffer.concat([Buffer.from(`<< /Length ${body.length} >>\nstream\n`), body, Buffer.from("\nendstream")]);
  });
  const encryptObj = objects.length;
  if (sec) {
    objects[encryptObj] = Buffer.from(
      `<< /Filter /Standard /V 4 /R 4 /Length 128 /CF << /StdCF << /AuthEvent /DocOpen /CFM /AESV2 /Length 16 >> >> /StmF /StdCF /StrF /StdCF /O <${sec.o.toString("hex")}> /U <${sec.u.toString("hex")}> /P ${sec.p} >>`,
    );
  }

  const chunks: Buffer[] = [Buffer.from("%PDF-1.6\n%\xe2\xe3\xcf\xd3\n", "latin1")];
  const offsets: number[] = [];
  let length = chunks[0].length;
  for (let n = 1; n < objects.length; n++) {
    offsets[n] = length;
    const chunk = Buffer.concat([Buffer.from(`${n} 0 obj\n`), objects[n], Buffer.from("\nendobj\n")]);
    chunks.push(chunk);
    length += chunk.length;
  }
  const xref = [`xref\n0 ${objects.length}\n0000000000 65535 f \n`, ...offsets.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)].join("");
  const hexId = id.toString("hex");
  const trailer = `trailer\n<< /Size ${objects.length} /Root 1 0 R /ID [<${hexId}> <${hexId}>]${sec ? ` /Encrypt ${encryptObj} 0 R` : ""} >>\nstartxref\n${length}\n%%EOF\n`;
  chunks.push(Buffer.from(xref + trailer, "latin1"));
  return Uint8Array.from(Buffer.concat(chunks));
}

/** Lays out table rows top-down, one row per 14pt; each row is [x, text] pairs. */
export function tablePage(rows: [number, string][][], top = 560): PdfCell[] {
  return rows.flatMap((row, i) => row.map(([x, text]) => ({ x, y: top - i * 14, text })));
}
