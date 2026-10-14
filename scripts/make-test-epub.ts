/**
 * Builds /tmp/test-book.epub — a tiny EPUB with a cover image and an
 * embedded illustration, used to verify FMT-002 cover extraction + images.
 * Images are generated with sharp (real encoder → browser-safe PNGs).
 * Run: node scripts/make-test-epub.mjs   (or bun, it resolves sharp from node_modules)
 */
import { zipSync, strToU8 } from "fflate";
import { writeFileSync } from "node:fs";
import sharp from "sharp";

const coverSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='340'>
  <rect width='240' height='340' fill='#f7f1e8'/>
  <rect width='240' height='130' fill='#f8694c'/>
  <circle cx='196' cy='96' r='34' fill='#ffffff' opacity='0.35'/>
  <g stroke='#141414' stroke-width='5'>
    ${Array.from({ length: 9 }, (_, i) => `<line x1='${i * 30 - 40}' y1='140' x2='${i * 30 + 10}' y2='340'/>`).join("")}
  </g>
  <text x='20' y='60' font-family='sans-serif' font-size='26' font-weight='bold' fill='#ffffff'>CORAL</text>
  <text x='20' y='90' font-family='sans-serif' font-size='16' fill='#ffffff'>test book</text>
</svg>`;

const illusSvg = `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='180'>
  <rect width='300' height='180' fill='#f7f1e8'/>
  <circle cx='150' cy='90' r='60' fill='#f8694c'/>
  <circle cx='150' cy='90' r='80' fill='none' stroke='#141414' stroke-width='4'/>
  <circle cx='130' cy='80' r='6' fill='#141414'/>
  <circle cx='170' cy='80' r='6' fill='#141414'/>
</svg>`;

const coverPng = new Uint8Array(await sharp(Buffer.from(coverSvg)).png().toBuffer());
const illusPng = new Uint8Array(await sharp(Buffer.from(illusSvg)).png().toBuffer());

const zip = zipSync({
  mimetype: strToU8("application/epub+zip"),
  "META-INF/container.xml": strToU8(`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`),
  "OEBPS/content.opf": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:oni:testbook</dc:identifier>
    <dc:title>The Coral Test Book</dc:title>
    <dc:creator>Z. Tester</dc:creator>
    <meta name="cover" content="cover-image"/>
  </metadata>
  <manifest>
    <item id="cover-image" href="cover.png" media-type="image/png" properties="cover-item"/>
    <item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="c3" href="ch3.xhtml" media-type="application/xhtml+xml"/>
    <item id="illus" href="illus.png" media-type="image/png"/>
  </manifest>
  <spine>
    <itemref idref="c1"/><itemref idref="c2"/><itemref idref="c3"/>
  </spine>
</package>`),
  "OEBPS/cover.png": coverPng,
  "OEBPS/illus.png": illusPng,
  "OEBPS/ch1.xhtml": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter One</title></head>
<body><h1>Chapter One</h1>
<p>This chapter verifies that images resolve from sub-paths and the OPF cover is extracted as the work thumbnail.</p>
<p>${"Coral prose. ".repeat(40)}</p>
</body></html>`),
  "OEBPS/ch2.xhtml": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter Two</title></head>
<body><h1>Chapter Two — with art</h1>
<p>Below is an embedded illustration stored in the EPUB zip beside the chapter file.</p>
<figure><img src="illus.png" alt="circles"/><figcaption>An oni-circle illustration</figcaption></figure>
<p>${"More sample text. ".repeat(60)}</p>
</body></html>`),
  "OEBPS/ch3.xhtml": strToU8(`<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>فصل سوم</title></head>
<body><h1>فصل سوم</h1>
<p>این فصل برای آزمودن متن راست‌به‌چپ فارسی در کتاب است. ${"متن نمونه. ".repeat(30)}</p>
</body></html>`),
});

writeFileSync("/tmp/test-book.epub", zip);
console.log("written /tmp/test-book.epub", zip.length, "bytes");
