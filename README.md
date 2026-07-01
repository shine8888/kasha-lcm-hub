# Low Carbon Materials Hub

> A small public website that lets a non-expert builder compare concrete products by their embodied
> carbon — across the full EN 15804 life cycle, not just one headline number. Every figure on the
> screen traces back to the page of the EPD PDF it came from.

Built for the **Full Stack Lead take-home assessment** (Low Carbon Materials Hub).

- **Live**: _add Vercel URL after `vercel deploy`_
- **Extraction reasoning**: [`EXTRACTION.md`](./EXTRACTION.md)
- **Data**: [`/data/*.json`](./data) — one JSON per source EPD
- **Sources**: [`/public/sources/*.pdf`](./public/sources) — the original PDFs, served at runtime so provenance links work

---

## What I built and why

**Stack**: Next.js 16 (App Router, RSC), TypeScript, Tailwind 4, Zod, Anthropic SDK.

**Shape**: One Next.js app, two surfaces:

1. **An offline extraction pipeline** (`npm run extract`) that reads each PDF, sends it to Claude
   Sonnet 4.6 with a strict JSON schema, validates the result with Zod, and writes one JSON file
   per EPD into [`/data`](./data). Provenance — `{ pageNumber, snippet, confidence, method }` —
   is enforced as a required field of the schema, not bolted on.
2. **A read-only Next.js app** that loads those JSON files at build time (server components), and
   renders a product list, a detail page per product, and a side-by-side compare view. Every
   number on screen carries a `p.N` link that opens the source PDF at the cited page.

### A few decisions worth flagging

- **Static JSON, no database.** The dataset is 20 records that change when extraction is rerun,
  not when users click around. A database would add operational complexity for no read benefit.
- **Stage-level discriminated union.** A life-cycle module is either `{ declared: true, gwpTotal, … }`
  or `{ declared: false, reason? }`. There is no third state where the UI silently substitutes 0.
  This is the contract that makes "not declared ≠ zero" structural rather than aspirational.
- **Functional-unit honesty.** Comparing 1 m³ to 1 tonne of concrete is misleading. The compare
  page detects the mismatch and renders a banner saying so — it does **not** convert silently.
- **Per-field provenance, not per-document.** Each value points to its own page + verbatim
  snippet. A user can click any cell and verify the number, even when an EPD lists two values
  for the same indicator (gross vs net, multiple mixes).
- **Server forms, URL state.** Filters and selection are plain HTML `<form method="get">`. No
  client-side state, no hydration cost, every view is bookmarkable and shareable.

I did **not** mirror the in-house NestJS microservice pattern (`lr-be-framework` / `simple-invoice`
/ `assessment-reservation`). The brief is explicit: Next.js + Node.js + TypeScript, deployed to
Vercel, ~4 focused hours. Spinning up RabbitMQ + Postgres + a 5-service compose stack would have
been the wrong signal to send for this brief. Reasoning trail in `EXTRACTION.md`.

---

## Running it locally

```bash
git clone … && cd lcm-hub
npm install
npm run dev              # http://localhost:3000
```

The repo ships with the extracted JSON files in [`/data`](./data) — the app works out of the box.

### Verifying the extracted data

```bash
npm run verify        # 5 checks per record; see scripts/verify/run.ts
npm test              # vitest unit specs for pure helpers
```

`npm run verify` cross-checks every JSON against its source PDF: schema, sha256, page bounds, snippet grounding (fuzzy `pdftotext` re-check), and the EN 15804+A2 GWP formula (`total = fossil + biogenic + LULUC`). Current run: **20 records, 0 errors, 8 grounding warnings** — all on PDFs whose LCA tables are graphical, not text. See [EXTRACTION.md](./EXTRACTION.md#accuracy).

### Re-running extraction

You only need this if you want to verify the pipeline against a new PDF set:

```bash
# 1. Drop the source EPD PDFs in ~/Downloads/epds (override with --src)
# 2. Set your key:
export ANTHROPIC_API_KEY=sk-ant-...
# 3. Run:
npm run extract
# Options:
#   --src <dir>          Source dir (default ~/Downloads/epds)
#   --only <substring>   Only process matching PDFs
#   --force              Re-extract files that already have JSON
```

Each PDF takes 10–30 seconds. The runner writes:

- `data/<id>.json` — validated against `src/lib/schema.ts`
- `public/sources/<id>.pdf` — a copy that Vercel serves so provenance links resolve

If extraction fails for a PDF, the runner logs the schema-validation issues for that file and
continues with the rest. Failed files are summarised at the end.

---

## Project layout

```
lcm-hub/
├── data/                    # /data/<id>.json — extracted, schema-validated EPD records
├── public/sources/          # /sources/<id>.pdf — copies of the originals, served by Vercel
├── scripts/extract/
│   ├── run.ts               # the extraction runner
│   └── prompt.ts            # the system prompt with hard rules: provenance required, no fabricating
├── src/
│   ├── app/
│   │   ├── page.tsx         # list page with filters + multi-select
│   │   ├── products/[id]/   # detail page
│   │   ├── compare/         # side-by-side compare
│   │   ├── about/           # data scope + honesty rule
│   │   ├── layout.tsx
│   │   └── not-found.tsx
│   ├── components/
│   │   ├── Filters.tsx
│   │   └── Provenance.tsx   # ProvenanceLink + NotDeclared badge
│   └── lib/
│       ├── schema.ts        # Zod schema = contract between Part 1 and Part 2
│       └── data.ts          # server-only loader: reads + validates /data/*.json
├── EXTRACTION.md            # Part-1 reasoning (model choice, accuracy methodology, caveats)
└── README.md                # you are here
```

---

## What's out of scope (and why)

- **Auth / write paths.** Data is read-only. No user-supplied numbers means no values without
  provenance.
- **Cross-unit normalization.** When an EPD reports per tonne and another per m³, the compare page
  warns rather than converts. Silent conversion hides the assumption.
- **Non-GWP indicators** (acidification, eutrophication, ozone, etc.). The brief is about embodied
  carbon — adding eight more indicator columns would dilute the comparison.
- **UI-level React tests.** The Zod schema, `npm run verify` (5 invariants × 20 records), and the
  11-spec Vitest suite for pure helpers in `src/lib/data.ts` cover the load-bearing logic. A
  render-tree RTL suite for the compare page would be the natural next spec — skipped in scope.

---

## Deployment

```bash
npx vercel deploy --prod
```

The app has no environment variables in production — `ANTHROPIC_API_KEY` is only needed for the
extraction script, which runs locally and commits its output to the repo. Vercel just serves the
JSON + PDFs + Next bundle.

---

## License

Submitted as an assessment artifact. The extracted JSON references publicly-published EPDs —
copyright in the original PDFs remains with the issuing manufacturers.
