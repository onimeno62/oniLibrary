(async () => {
  const r = await fetch("http://localhost:3031/pdf3-4p.pdf");
  const blob = await r.blob();
  const f = new File([blob], "Vol 4.pdf", { type: "application/pdf" });
  const dt = new DataTransfer();
  dt.items.add(f);
  const inputs = document.querySelectorAll('input[type="file"]');
  const fileInput = inputs[0]; // first = plain multi-file input
  fileInput.files = dt.files;
  fileInput.dispatchEvent(new Event("change", { bubbles: true }));
  return "single-injected";
})()
