(async () => {
  const specs = [
    ["MyPdfManga/Vol 1.pdf", "http://localhost:3031/pdf1-3p.pdf"],
    ["MyPdfManga/Vol 2.pdf", "http://localhost:3031/pdf2-2p.pdf"],
    ["MyPdfManga/Vol 3.pdf", "http://localhost:3031/pdf3-4p.pdf"],
  ];
  const dt = new DataTransfer();
  const out = [];
  for (const [path, url] of specs) {
    const r = await fetch(url);
    const blob = await r.blob();
    const f = new File([blob], path.split("/").pop(), { type: "application/pdf" });
    Object.defineProperty(f, "webkitRelativePath", { value: path });
    const it = dt.items.add(f);
    out.push(path.split("/").pop() + ":" + (it ? it.kind : "null"));
  }
  out.push("files:" + dt.files.length);
  const inputs = document.querySelectorAll('input[type="file"]');
  out.push("inputs:" + inputs.length);
  const folderInput = inputs[1];
  if (!folderInput) { out.push("NO-FOLDER-INPUT"); return out.join("|"); }
  folderInput.files = dt.files;
  out.push("assigned:" + folderInput.files.length);
  folderInput.dispatchEvent(new Event("change", { bubbles: true }));
  out.push("dispatched");
  return out.join("|");
})()
