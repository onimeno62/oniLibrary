(async () => {
  const specs = [
    ["MyPdfManga/Vol 1.pdf", "http://localhost:3031/pdf1-3p.pdf"],
    ["MyPdfManga/Vol 2.pdf", "http://localhost:3031/pdf2-2p.pdf"],
    ["MyPdfManga/Vol 3.pdf", "http://localhost:3031/pdf3-4p.pdf"],
  ];
  const dt = new DataTransfer();
  for (const [path, url] of specs) {
    const r = await fetch(url);
    const blob = await r.blob();
    const f = new File([blob], path.split("/").pop(), { type: "application/pdf" });
    Object.defineProperty(f, "webkitRelativePath", { value: path });
    dt.items.add(f);
  }
  const inputs = document.querySelectorAll('input[type="file"]');
  const folderInput = inputs[1];
  if (!folderInput) return "NO-FOLDER-INPUT";
  folderInput.files = dt.files;
  folderInput.dispatchEvent(new Event("change", { bubbles: true }));
  return "injected:" + dt.files.length;
})()
