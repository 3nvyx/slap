/**
 * Crude local PDF text extraction with no dependencies, used as the fallback when a
 * backend cannot take the PDF directly (mock mode, or Claude rejecting the document).
 * Inflates FlateDecode streams with node:zlib and collects the string operands of
 * Tj / TJ / ' / " text operators. Works for simple text PDFs; PDFs with custom font
 * encodings (CID fonts) come back partly garbled, which is why it is only a fallback.
 */
import { inflateSync } from "node:zlib";

export function extractPdfText(pdf: Buffer, maxChars = 200_000): string {
  const src = pdf.toString("latin1");
  const parts: string[] = [];
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  let total = 0;
  while ((m = re.exec(src)) && total < maxChars) {
    const start = m.index + m[0].length;
    const end = src.indexOf("endstream", start);
    if (end < 0) break;
    const dictStart = src.lastIndexOf("<<", m.index);
    const dict = dictStart >= 0 ? src.slice(dictStart, m.index) : "";
    let body = pdf.subarray(start, end);
    if (/FlateDecode/.test(dict)) {
      try { body = inflateSync(body); } catch { re.lastIndex = end; continue; }
    } else if (/\/Filter/.test(dict)) { re.lastIndex = end; continue; }   // other filters (images etc.)
    const text = textFromContentStream(body.toString("latin1"));
    if (text.trim()) { parts.push(text); total += text.length; }
    re.lastIndex = end;
  }
  return parts.join("\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, maxChars);
}

function textFromContentStream(s: string): string {
  if (!/\b(BT|Tj|TJ)\b/.test(s)) return "";
  const out: string[] = [];
  // Walk tokens: strings, arrays, and operators that break lines.
  const tok = /\((?:\\.|[^\\)])*\)|\[[^\]]*\]\s*TJ|T\*|Td|TD|Tm|ET|'|"/g;
  let t: RegExpExecArray | null;
  let line = "";
  while ((t = tok.exec(s))) {
    const v = t[0];
    if (v.startsWith("(")) line += unescapePdf(v.slice(1, -1));
    else if (v.startsWith("[")) {
      const strs = v.match(/\((?:\\.|[^\\)])*\)|-?\d+(\.\d+)?/g) ?? [];
      for (const x of strs) {
        if (x.startsWith("(")) line += unescapePdf(x.slice(1, -1));
        else if (Number(x) < -200) line += " ";         // large kerning gap = word space
      }
    } else { if (line.trim()) out.push(line); line = ""; }
  }
  if (line.trim()) out.push(line);
  return out.join("\n");
}

function unescapePdf(s: string): string {
  return s.replace(/\\(\d{1,3}|.)/g, (_, c: string) => {
    if (/^\d+$/.test(c)) return String.fromCharCode(parseInt(c, 8));
    return ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" } as Record<string, string>)[c] ?? c;
  });
}

/** Builds a minimal one-font text PDF (uncompressed). Used by tests and fixtures. */
export function makeTextPdf(lines: string[]): Buffer {
  const esc = (s: string) => s.replace(/[\\()]/g, m => "\\" + m);
  const content = ["BT", "/F1 11 Tf", "50 760 Td", "14 TL",
    ...lines.map(l => `(${esc(l)}) Tj T*`), "ET"].join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => { offsets.push(Buffer.byteLength(out, "latin1")); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map(o => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}
