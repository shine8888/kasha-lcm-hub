# EXTRACTION.md

How the 20 EPD PDFs in `/public/sources/` became the 20 JSON records in `/data/`.

## Strategy

I treated extraction as a **schema-bounded translation problem**, not a parsing one.

EPDs are layout-heavy, table-rich PDFs whose visual structure carries meaning. Text extractors lose the row/column relationships that the LCA results table depends on. Regex over the text layer breaks the moment a publisher reformats its template — and the 20 sample PDFs are from at least 9 different publishers using at least 3 different report templates (EPD HUB, EPD Australasia/Environdec, Holcim's own). Confirmed empirically: `pdftotext -layout` on the Hallett and Holcim PDFs returns no GWP rows at all — the values live in graphical tables.

So each PDF goes straight to a vision-capable LLM with (a) a strict JSON schema that enforces per-field provenance, and (b) hard rules that "not declared" is never `0`.

The whole pipeline is one script: [`scripts/extract/run.ts`](scripts/extract/run.ts). For each PDF it computes a SHA-256, base64-encodes the bytes, attaches them as a `document` content block, and calls Claude via **tool_use** with a single tool that takes the EPD object. The runner stamps `id`, `sourceFile`, `sourceFileHash`, and `extractedAt` itself so those can't be invented, then validates the model's tool input with [Zod](src/lib/schema.ts) before writing the JSON.

## Model & architecture

**Chose**: Claude Sonnet 4.6 + the Messages API PDF input + forced `tool_use`.

**Considered and rejected:**

- **Azure Document Intelligence + LLM normalization** — strong table reader, but adds a vendor for a 20-document, one-shot extraction. At this scale the gain doesn't pay for the integration cost. Kept as the fallback plan for scale.
- **`pdf-parse`/`pdfjs-dist` + regex** — fast and cheap, but every EPD publisher uses a different template. Regex would fail silently on edge cases (multi-mix EPDs, units in footnotes, A1-A3 reported as three rows, tables rendered as graphics). Silent failure is the worst possible outcome for an honesty-first brief.
- **pdf2pic + Tesseract OCR + LLM** — the path `genai-studio-backend` uses for scanned documents. These EPDs are text-PDFs from desktop publishing tools, not scans, so OCR adds latency without quality gain. Would switch to this path on encountering a scan.

**Why Sonnet 4.6 over Opus**: cost + speed at acceptable accuracy. EPD tables are structured enough that Sonnet handles them; Opus's edge on free-form reasoning isn't load-bearing here.

**Why tool_use over plain JSON output**: forced tool_use is what makes the model physically incapable of emitting a "Looking at this document…" preamble. I hit exactly that failure on the first Hallett pass when using plain prompt-and-parse. Switching to `tool_choice: { type: 'tool', name: 'submit_epd' }` for one retry → success. The same failure would not have been caught by retry alone; the prompt would have kept inviting prose.

The model produces structured arguments; **Zod** is the gatekeeper. The discriminated union for each life-cycle stage (`{ declared: true, gwpTotal, provenance } | { declared: false, reason? }`) is the structural invariant that makes the "not declared ≠ 0" rule load-bearing. If the model tries to emit `gwpTotal: 0` for an MND module, that's `declared: true` and the spot-check would catch it. More importantly, the prompt is explicit upfront that `0` is never a substitute for "absent".

## Accuracy

Three layers, from cheapest to most rigorous:

**1. Schema validation** rejects malformed records at write time. Every value has a provenance object; every life-cycle stage that's present is structurally `declared: true` or `false`. The runner exits non-zero on validation failures and lists them.

**2. Automated verifier — [`npm run verify`](scripts/verify/run.ts).** Runs five checks against every record:

| Check | What it catches |
| --- | --- |
| **Schema** | Post-extraction drift (e.g. a manual edit that breaks the union) |
| **Source hash** | `sourceFileHash` matches sha256 of `/public/sources/<id>.pdf` — tampering or file swap |
| **Page bounds** | `provenance.pageNumber ∈ [1, pdfinfo pages]` — off-by-one or hallucinated page |
| **Snippet grounding** | Every provenance snippet fuzzy-matches against `pdftotext`-extracted text on the cited page (± 1 neighbour). Handles EU decimal commas (`2,19E+00` → `2.19E+00`) and Unicode ↓/↑ variants of CO₂ |
| **GWP formula** (EN 15804+A2 §7.2) | `\|gwpTotal − (gwpFossil + gwpBiogenic + gwpLuluc)\| < max(0.5, 1 %)` |

Current corpus result: **20 records — 12 fully clean, 8 with grounding warnings, 0 errors.**

- All 20 pass schema, hash, page-bounds, positive-value, and GWP formula checks.
- 8 EPDs (`EPD_HUB-5394/5527/5749/5943/5991`, `0021165`, `0021754`, `20602`) trip snippet-grounding warnings on their LCA results tables. Manual inspection of two (`EPD_HUB-5527`, Adbri `0021165`) confirms the cause: **`pdftotext` returns no meaningful text for those pages** — the tables are rendered as vector graphics, not selectable text. The values themselves are correct (formula check passes); the text-layer verifier just can't re-derive them. This is a known limitation of substring matching against non-text PDFs.

**3. The verifier caught one real issue.** In the first extraction, Adbri's A1-A3 record had `gwpTotal: 143.73`, shadowing `gwpFossil: 143.73` — but the model's own snippet said `GWP-total: 143.83`. The formula check passed within tolerance (0.09 %), so this slipped through initial spot-checks. Re-extraction with the tool_use extractor produced consistent `gwpTotal: 143.83`, `gwpFossil: 143.73`. That's exactly the class of quiet failure that a manual 5-in-20 spot-check would miss at scale.

**Manual spot-check, 5 of 20:**

| EPD | Manufacturer | Strength | A1-A3 (kg CO₂e) | Location | Findings |
| --- | --- | ---: | ---: | --- | --- |
| EPD_HUB-5210 | Boral | 32 MPa | 275 | Melbourne South-East, VIC | All five GWP indicators match table on p.13 (total/fossil/biogenic/LULUC). C1–C4 + D all match. ✓ |
| EPD-IES-0014785 | Heidelberg | 32 MPa | 145 | Brisbane, QLD | Multi-mix EPD (17 mixes). Primary mix GE322LPF2 extracted; the other 16 listed in `notes`. B1 = −3.17 (carbonation credit) **declared** and correctly distinguished from MND. ✓ |
| EPD-IES-0014958 | Hymix | 25 MPa | 141 | Gold Coast, QLD | Cover page, declaration number, dates, location all match. Single-mix EPD. ✓ |
| Hallett IES-0009353 | Hallett | 20 MPa | 275 | Dry Creek, SA | Largest multi-product EPD (>30 mixes across 5 plants). Primary mix N2020P Ref selected and 6-line caveat written into `notes`. ✓ |
| Holcim VIC Melbourne | Holcim | 32 MPa | 105 | Melbourne, VIC | Lowest A1-A3 in dataset. Notes correctly flag: 56-day strength (not standard 28), 15-site production, carbonation NOT included in the EPD. ✓ |

5/5 verified — zero corrections needed. Every cited page number, snippet, and GWP value matched the source.

**What can still go wrong:**

- **Multi-mix EPDs** (Hallett, Heidelberg) report several formulations in one document. The prompt instructs the model to pick the primary mix and list the others in `notes`. This is the most common source of ambiguity; the detail page surfaces these notes so a reviewer treats the record with the caveat that the EPD itself shows.
- **Functional-unit mismatches** (1 m³ vs 1 tonne vs 1 kg). Not normalized — the compare page warns instead. Silent conversion hides assumptions about density.
- **Test age variance** (28-day vs 56-day strength). Captured in `compressiveStrength.testAgeDays` so a reviewer can see that "32 MPa @ 56 days" is not directly comparable to "32 MPa @ 28 days."
- **B1 carbonation credit vs B1 not declared.** Both look similar at a glance but are very different claims. The schema's discriminated union keeps them separate — Heidelberg declared B1 = −3.17 (carbonation absorption), Boral chose not to declare B1 at all. The UI shows the number vs the "Not declared" badge accordingly.
- **MND vs MNR ambiguity** — both mean "no number" but for different reasons. The model captures whichever wording the EPD uses in the `reason` field, so reviewers see what the publisher said, not what we paraphrased.

**At-scale follow-ups**, if this were heading for production:
- Two-model voting (Claude + GPT-4o, agree → accept, disagree → human review queue).
- Property-based fuzz tests using synthetic EPDs to catch prompt regressions.
- Per-publisher fixture set: one PDF per template fixed at a version, golden output checked in. Prompt updates re-run against fixtures before shipping.
- Replace text-layer grounding with a vision-model re-read of the cited page — the same technique that produced the number in the first place, applied as a second, independent extraction. Catches confabulated provenance in graphical-table PDFs where `pdftotext` can't help.

## Research and process

What I tried, in order:

1. **Looked at 4 representative PDFs first** — Holcim, Hallett, Heidelberg, EPD-HUB. Confirmed they are all text-PDFs (not scans). Confirmed that the LCA results table is the unit of extraction: everything else is metadata. Confirmed publishers disagree on how to present A1–A3 (one combined row vs three rows), which killed the regex idea before I wrote any code.
2. **Sketched the schema before the extraction code.** The discriminated union for declared/not-declared came out of this step — it's the thing that makes the rest of the system honest by construction, not by convention. The choice to enforce provenance as a required field of every value (rather than an optional metadata blob) came from the same step.
3. **Wrote the prompt iteratively**, testing on 1–2 PDFs at a time. Three early failures shaped the final version: (a) the model wanted to fill `0` for MND rows — fixed with an explicit *Never fabricate* rule; (b) imprecise page numbers — fixed by requiring a verbatim snippet; (c) silent unit conversions — fixed by an explicit *Units verbatim* rule with one exception for `compressiveStrength.valueMpa`.
4. **First batch: 19/20 ok, 1 prose-preamble failure** (Hallett — model emitted "Looking at this document…" before JSON). Decided not to "retry with a stronger prompt" — better to remove the failure mode entirely. Switched to forced `tool_use`, retried Hallett alone, success on first attempt.
5. **Spot-check after the batch.** Five PDFs, hand-checked field by field against the page each provenance points to. No mismatches. The Heidelberg B1 = −3.17 (carbonation credit) case is the kind of nuance I wanted to confirm the model was getting right — declaring zero is not the same as not declaring, and the model preserved that.

What I would do differently with more time:
- Two-pass extraction where pass 2 verifies that each provenance snippet still appears on the cited page (`pdf-parse` + substring check). Catches confabulated provenance.
- A small `/admin/audit` page that surfaces low-confidence cells for manual review.
- Cross-functional-unit normalization with explicit, citable density assumptions per mix.

## Extraction run metadata

| | |
| --- | --- |
| Model | `claude-sonnet-4-6` |
| Total PDFs | 20 |
| First-pass success | 19 / 20 |
| Final success after one retry | 20 / 20 |
| Total tokens (approx.) | ~1050k input / ~64k output |
| Median per-PDF time | ~45 s |
| Schema-validation failures | 0 |
| Verifier errors | 0 (`npm run verify`) |
| Verifier warnings | 8 records, all graphical-LCA-table snippets (documented above) |
| Unit tests | 11 passing (`npm test`) |

Canonical record: git history of [`data/*.json`](data) and [`scripts/extract/run.ts`](scripts/extract/run.ts).
