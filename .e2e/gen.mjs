// minimal valid multi-page PDF generator (for browser E2E fixtures)
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
mkdirSync("/tmp/pdffix", { recursive: true });

function makePdf(pages, label) {
  const objs = [];
  const pageNums = [];
  for (let i = 1; i <= pages; i++) pageNums.push(3 + (i - 1) * 2);
  const fontNum = 3 + pages * 2;

  objs[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objs[2] = `<< /Type /Pages /Kids [${pageNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${pages} >>`;
  for (let i = 1; i <= pages; i++) {
    const n = 3 + (i - 1) * 2;
    objs[n] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${n + 1} 0 R /Resources << /Font << /F1 ${fontNum} 0 R >> >> >>`;
    const text = `${label} - Page ${i} of ${pages}`;
    const stream = `BT /F1 42 Tf 72 700 Td (${text}) Tj ET`;
    objs[n + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  }
  objs[fontNum] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;

  let out = "%PDF-1.4\n";
  const offsets = [];
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = out.length;
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xrefAt = out.length;
  out += `xref\n0 ${objs.length}\n`;
  out += `0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) {
    out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

const fixtures = [
  ["pdf1-3p.pdf", makePdf(3, "Volume One")],
  ["pdf2-2p.pdf", makePdf(2, "Volume Two")],
  ["pdf3-4p.pdf", makePdf(4, "Volume Three")],
];
const map = {};
for (const [name, buf] of fixtures) {
  writeFileSync(`/tmp/pdffix/${name}`, buf);
  map[name] = buf.toString("base64");
  console.log(name, buf.length, "bytes");
}
writeFileSync("/tmp/pdffix/b64.json", JSON.stringify(map));
console.log("b64.json written");
