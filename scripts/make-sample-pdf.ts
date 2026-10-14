/**
 * Generates public/samples/oni-library-guide.pdf — the built-in demo PDF
 * attached to the seeded "oniLibrary Field Guide" work (FMT-003 demo).
 * Run: bun scripts/make-sample-pdf.ts
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { mkdirSync, writeFileSync } from "node:fs";

const CREAM = rgb(0.968, 0.945, 0.91);
const CORAL = rgb(0.973, 0.412, 0.298);
const INK = rgb(0.08, 0.08, 0.08);
const MUTED = rgb(0.42, 0.38, 0.34);

const W = 595; // A4 @72dpi
const H = 842;

async function main() {
  const doc = await PDFDocument.create();
  doc.setTitle("oniLibrary Field Guide");
  doc.setAuthor("oniLibrary");
  doc.setSubject("How to use oniLibrary");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const page = () => doc.addPage([W, H]);

  // ---------- cover ----------
  {
    const p = page();
    p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: CREAM });
    p.drawRectangle({ x: 0, y: 700, width: W, height: 142, color: CORAL });
    p.drawText("oniLibrary", { x: 48, y: 760, size: 40, font: bold, color: rgb(1, 1, 1) });
    p.drawText("FIELD GUIDE", { x: 48, y: 726, size: 20, font, color: rgb(1, 1, 1) });
    // oni-mask-ish motif
    p.drawCircle({ x: W - 90, y: 770, size: 34, color: rgb(1, 1, 1), opacity: 0.22 });
    p.drawCircle({ x: W - 104, y: 780, size: 5, color: CORAL });
    p.drawCircle({ x: W - 76, y: 780, size: 5, color: CORAL });
    p.drawText("Your stories. In one place.", { x: 48, y: 640, size: 16, font: italic, color: MUTED });
    const lines = [
      "Manga · Manhwa · Webtoons",
      "Comics · Books · PDF",
      "Offline downloads",
      "Private vault",
      "Reading statistics",
      "Extensible sources",
    ];
    lines.forEach((s, i) => {
      p.drawText(`—  ${s}`, { x: 52, y: 580 - i * 30, size: 13, font, color: INK });
    });
    p.drawText("v1.0 · sample document", { x: 48, y: 60, size: 10, font, color: MUTED });
  }

  // ---------- content pages ----------
  const pages: { title: string; body: string[] }[] = [
    {
      title: "1 · Building your library",
      body: [
        "oniLibrary keeps every story in one place. Open the Library tab to see",
        "your grid of works, grouped by categories you define.",
        "",
        "Import local files with the + button: CBZ / ZIP archives, folders of",
        "images, EPUB books and PDF documents are all parsed on-device and",
        "stored privately in your browser storage. Nothing is uploaded.",
        "",
        "Long-press any cover to enter selection mode — you can then move works",
        "into categories, change their reading status, hide them in the private",
        "vault, or delete them.",
      ],
    },
    {
      title: "2 · The reader",
      body: [
        "Tap the center of any page to show or hide the reading chrome.",
        "Side taps flip pages (direction-aware for right-to-left manga).",
        "",
        "The bottom toolbar gives you fit modes (width, height, screen,",
        "original), zoom up to 2x with pan, rotation, brightness and the",
        "per-series reading settings sheet.",
        "",
        "Four documented presets configure everything at once:",
        "Manga (RTL, paged, black), Comics (LTR, white), Webtoon (vertical,",
        "gapless) and One-handed (larger pages, auto-advance).",
      ],
    },
    {
      title: "3 · Books & PDFs",
      body: [
        "EPUB books open in a typographic view with adjustable text size,",
        "embedded images, lists, quotes and full RTL support for Persian",
        "chapters. Progress is remembered as a scroll ratio per chapter.",
        "",
        "PDF documents render page by page on canvas — zoom stays sharp",
        "because pages redraw at your display's pixel density. The page",
        "slider, bookmarks and reading position all work exactly like manga",
        "chapters.",
        "",
        "This very document is a PDF being rendered that way.",
      ],
    },
    {
      title: "4 · Downloads & offline",
      body: [
        "Mark chapters for download from the chapter list or the reader menu.",
        "The Downloads tab shows live progress, speed and the storage bar.",
        "",
        "Rules from Settings apply: Wi-Fi-only mode and the number of",
        "parallel downloads. Finished chapters get the offline badge in the",
        "reader, so you always know what is safe to read without a network.",
      ],
    },
    {
      title: "5 · Sources & extensions",
      body: [
        "Discover browses catalogs like MangaDex. Add works to your library",
        "with one tap; updates are checked from the Updates tab.",
        "",
        "Extensions add new sources. Every extension shows trust and",
        "compatibility badges — official and verified ones install without",
        "a prompt, community ones ask for confirmation first.",
      ],
    },
    {
      title: "6 · Privacy by default",
      body: [
        "The vault hides chosen works behind a PIN (with optional biometric",
        "unlock and auto-lock when the app goes to the background).",
        "",
        "Statistics, history and backups all live on your device. Create a",
        "portable .onibackup file from More > Backup, and restore it on any",
        "device later.",
        "",
        "Happy reading!",
      ],
    },
  ];

  for (const item of pages) {
    const p = page();
    p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: CREAM });
    p.drawRectangle({ x: 0, y: H - 86, width: W, height: 86, color: CREAM });
    p.drawRectangle({ x: 48, y: H - 92, width: 64, height: 4, color: CORAL });
    p.drawText(item.title, { x: 48, y: H - 128, size: 22, font: bold, color: INK });
    item.body.forEach((line, i) => {
      p.drawText(line, { x: 48, y: H - 168 - i * 22, size: 12, font, color: line ? INK : INK, opacity: line ? 0.92 : 1 });
    });
    p.drawText("oniLibrary Field Guide", { x: 48, y: 42, size: 9, font, color: MUTED });
  }

  // ---------- back cover ----------
  {
    const p = page();
    p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: INK });
    p.drawCircle({ x: W / 2, y: H / 2 + 60, size: 56, color: CORAL, opacity: 0.9 });
    p.drawText("oniLibrary", { x: W / 2 - 62, y: H / 2 - 40, size: 30, font: bold, color: rgb(1, 1, 1) });
    p.drawText("Your stories. In one place.", { x: W / 2 - 78, y: H / 2 - 66, size: 12, font: italic, color: rgb(0.8, 0.76, 0.72) });
  }

  const bytes = await doc.save();
  mkdirSync("public/samples", { recursive: true });
  writeFileSync("public/samples/oni-library-guide.pdf", bytes);
  console.log(`written public/samples/oni-library-guide.pdf (${bytes.length} bytes, ${doc.getPageCount()} pages)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
