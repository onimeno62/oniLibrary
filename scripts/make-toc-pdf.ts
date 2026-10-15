/**
 * Builds a minimal 2-page PDF with a document outline (/Outlines) used to
 * verify oniLibrary's getPdfToc(). Run: bun scripts/make-toc-pdf.ts → /tmp/oni-toc.pdf
 */

import { writeFileSync } from "node:fs";

function buildPdf(): Uint8Array {
  const enc = (s: string) => new TextEncoder().encode(s);

  const content1 = "BT /F1 28 Tf 72 700 Td (Outline Test) Tj 0 -40 Td (Page one) Tj ET";
  const content2 = "BT /F1 28 Tf 72 700 Td (Chapter Two) Tj 0 -40 Td (Page two) Tj ET";

  const objs: string[] = [
    "<< /Type /Catalog /Pages 2 0 R /Outlines 5 0 R /PageMode /UseOutlines >>", // 1
    "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>", // 2
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 8 0 R /Resources << /Font << /F1 9 0 R >> >> >>", // 3
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 10 0 R /Resources << /Font << /F1 9 0 R >> >> >>", // 4
    "<< /Type /Outlines /First 6 0 R /Last 7 0 R /Count 2 >>", // 5
    "<< /Title (Introduction to the Outline Test) /Parent 5 0 R /Next 7 0 R /Dest [3 0 R /Fit] >>", // 6
    "<< /Title (Chapter Two \\(deep dive\\)) /Parent 5 0 R /Dest [4 0 R /Fit] >>", // 7
    `<< /Length ${content1.length} >>\nstream\n${content1}\nendstream`, // 8
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", // 9
    `<< /Length ${content2.length} >>\nstream\n${content2}\nendstream`, // 10
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return enc(pdf);
}

async function main() {
  const bytes = buildPdf();
  writeFileSync("/tmp/oni-toc.pdf", bytes);
  console.log("wrote /tmp/oni-toc.pdf", bytes.length, "bytes");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
