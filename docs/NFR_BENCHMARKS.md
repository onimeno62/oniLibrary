# oniLibrary — NFR benchmarks & platform decision record

> Phase C-5 of the post-v1.5.0 audit plan (`docs/POST_V1.5.0_ACCEPTANCE_AUDIT.md` §10).
> Method: `scripts/bench-library.mjs` generates a deterministic 1 000-work store; the
> real app is loaded with it in Chromium (agent-browser) and measured in-page.
> **Environment honesty:** desktop Chromium against the dev server — NOT a reference
> Android device. Numbers are relative baselines for regression tracking, not device
> guarantees (PRD §19 requires validation on a reference device before product claims).

## Results (1 000 works, desktop Chromium, dev server)

| Measurement | Result | Notes |
| --- | --- | --- |
| Document load (DCL / load) | 260 ms / 495 ms | empty-shell load; hydration excluded |
| Library tab switch → grid painted | **1.62 s**, 18 815 DOM nodes | the whole grid mounts at once — no windowing |
| Scrolling the grid (10 × 1 500 px frames) | **157 ms total** (~16 ms/frame) | smooth once mounted; no long stalls |
| Search: type query → results rendered | ~0.5 s incl. the 400 ms debounce | substring match, honest empty states |
| Search with Persian-script titles | matched | mixed-script titles render and match |

## Findings

1. **NFR-001 is met at 1 000 entries with one caveat** — browsing and search stay
   responsive, but the library grid mounts every card (≈19 DOM nodes per card ⇒
   ~19 k nodes). A windowed/virtualized grid (render only the visible ~30 cards)
   is the clear next lever and would also cut memory on low-end devices.
2. **NFR-002 (usable in 2 s)** is met on desktop at first paint, but on-device
   numbers must be captured separately before any product claim.
3. **localStorage quota is a real ceiling** (~5 MB per origin): a 1 000-work store
   with rich chapters/descriptions exceeded it (QuotaExceededError). The store's
   guarded-storage wrapper already degrades safely (silent non-persist, no crash),
   and the shipped 17-work seed is far below the ceiling — but a genuine large
   library lives in IndexedDB blobs, NOT in this state; the state carries only
   metadata. Recommended follow-up (Phase C follow-on): trim persisted history/
   sessions earlier and/or move chapter metadata arrays out of the persisted
   snapshot for huge libraries.

## Reproducing

```bash
node scripts/bench-library.mjs 1000 > /tmp/bench-store.json
# serve /tmp/bench-store.json over http with CORS, then in the browser:
#   fetch(url).then(r=>r.text()).then(t=>localStorage.setItem('onilibrary-store-v1',t))
#   location.reload()
# (chunked localStorage injection works too — argv has a length limit)
```

## Owner-decision items (deferred, with estimates)

| Item | Audit ref | Why deferred | Rough estimate |
| --- | --- | --- | --- |
| OS-level notifications (POST_NOTIFICATIONS + runtime permission + channel + download-complete notify) | NTF-001/002 | Permission flow needs a device/emulator to validate; shipping blind is against the audit's honesty rule | 1–2 sessions incl. bridge + settings wiring + device pass |
| Release signing (retire the committed debug keystore) | REL-02 | Rotating keys breaks update compatibility for existing installs — an owner product decision, not an engineering one | 1 short session (new keystore + BUILDING.md) |
| Library grid virtualization | NFR-001 follow-up | Perf lever, not a defect; pairs best with a device-measured baseline | 1 session |
| Emulator/real-device pass (back-nav matrix, confirms, wake lock, TalkBack) | A6 exit criterion | No emulator in the sandbox | 0.5 session once an emulator is available |
