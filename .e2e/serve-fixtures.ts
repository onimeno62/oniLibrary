// tiny CORS static server for E2E fixtures (port 3031, /tmp/pdffix)
Bun.serve({
  port: 3031,
  async fetch(req) {
    const url = new URL(req.url);
    const name = url.pathname.replace(/^\//, "");
    if (!name || name.includes("..")) return new Response("nope", { status: 404 });
    const f = Bun.file(`/tmp/pdffix/${name}`);
    if (!(await f.exists())) return new Response("nope", { status: 404 });
    return new Response(f, {
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/pdf" },
    });
  },
});
console.log("fixtures on :3031");
