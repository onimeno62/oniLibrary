(async () => {
  const base = "http://localhost:3031/";
  const specs = [
    ["MyMixed/Vol 1.pdf", "pdf1-3p.pdf", "application/pdf"],
    ["MyMixed/Vol 2.pdf", "pdf2-2p.pdf", "application/pdf"],
    ["MyMixed/pages/img1.png", "img1.png", "image/png"],
    ["MyMixed/pages/img2.png", "img2.png", "image/png"],
    ["MyMixed/pages/img3.png", "img3.png", "image/png"],
  ];
  const dt = new DataTransfer();
  for (const [path, file, mime] of specs) {
    const r = await fetch(base + file);
    const blob = await r.blob();
    const f = new File([blob], path.split("/").pop(), { type: mime });
    Object.defineProperty(f, "webkitRelativePath", { value: path });
    dt.items.add(f);
  }
  const inputs = document.querySelectorAll('input[type="file"]');
  const folderInput = inputs[1];
  folderInput.files = dt.files;
  folderInput.dispatchEvent(new Event("change", { bubbles: true }));
  return "mixed-injected:" + dt.files.length;
})()
