import { describe, expect, it } from "vitest";
import { cleanFileName, sniffType } from "./attachment-files";

const bytes = (...b: (number | string)[]) => new Uint8Array(b.flatMap((x) => (typeof x === "string" ? [...x].map((c) => c.charCodeAt(0)) : [x])));

describe("attachment files", () => {
  it("recognises allowed formats from their bytes", () => {
    expect(sniffType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
    expect(sniffType(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a))).toBe("image/png");
    expect(sniffType(bytes("RIFF", 0, 0, 0, 0, "WEBPVP8 "))).toBe("image/webp");
    expect(sniffType(bytes("%PDF-1.7"))).toBe("application/pdf");
  });

  it("rejects everything else, whatever it is called", () => {
    expect(sniffType(bytes("<svg xmlns"))).toBeNull();
    expect(sniffType(bytes("<html>"))).toBeNull();
    expect(sniffType(bytes(0, 0, 0, 0x18, "ftypheic"))).toBeNull();
    expect(sniffType(bytes("GIF89a"))).toBeNull();
  });

  it("keeps names readable and gives them the real extension", () => {
    expect(cleanFileName("Struk Indomaret.JPEG", "image/jpeg")).toBe("Struk Indomaret.jpg");
    expect(cleanFileName("../../etc/passwd", "application/pdf")).toBe("passwd.pdf");
    expect(cleanFileName('<script>"x".png', "image/png")).toBe("scriptx.png");
    expect(cleanFileName(undefined, "image/webp")).toBe("lampiran.webp");
  });
});
