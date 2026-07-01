/**
 * Verifier — the second pass I said I'd build in EXTRACTION.md.
 *
 * For every extracted EPD, checks five invariants that the extraction step
 * itself can't guarantee:
 *
 *  1. Schema           — the JSON still matches src/lib/schema.ts.
 *  2. Source integrity — sourceFileHash matches sha256(/public/sources/<id>.pdf).
 *  3. Page bounds      — every provenance.pageNumber is in [1, totalPages].
 *  4. Snippet grounding— provenance.snippet appears (fuzzy) on the cited page.
 *  5. GWP formula      — for declared stages with a full breakdown,
 *                        |gwpTotal − (gwpFossil + gwpBiogenic + gwpLuluc)| < tol
 *                        per EN 15804+A2 §7.2.
 *
 * Usage:
 *   npm run verify                 # verify all
 *   npm run verify -- --only 5210  # only EPDs whose id contains "5210"
 *   npm run verify -- --strict     # exit non-zero on any warning
 *
 * Warnings vs errors:
 *   - Errors (non-zero exit): schema, hash, page bounds, formula.
 *   - Warnings (exit 0 unless --strict): snippet grounding failures,
 *     because pdftotext's text-layer extraction is imperfect on complex
 *     tables and the model may cite a valid page whose exact text we can't
 *     re-derive.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import { EpdSchema, LCA_STAGES, type Epd, isDeclared, type Provenance } from '../../src/lib/schema';

const root = resolve(__dirname, '..', '..');
const DATA_DIR = join(root, 'data');
const SOURCES_DIR = join(root, 'public', 'sources');

// -- CLI ------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return { only: get('--only'), strict: args.includes('--strict') };
}

// -- helpers --------------------------------------------------------

function sha256File(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function pdfPageCount(pdfPath: string): number {
  const out = execFileSync('pdfinfo', [pdfPath], { encoding: 'utf-8' });
  const m = out.match(/^Pages:\s+(\d+)/m);
  if (!m) throw new Error(`pdfinfo: no page count in output for ${pdfPath}`);
  return Number(m[1]);
}

function pdfPageText(pdfPath: string, page: number): string {
  return execFileSync('pdftotext', ['-layout', '-f', String(page), '-l', String(page), pdfPath, '-'], {
    encoding: 'utf-8',
    maxBuffer: 8 * 1024 * 1024,
  });
}

/**
 * Normalize for fuzzy substring matching between the model's snippet and
 * the PDF's text-layer output.
 * - lowercase
 * - collapse whitespace runs to single space
 * - drop punctuation that PDF layout inserts between cells
 * - normalize scientific/decimal notations to a canonical form
 * - fold unicode subscript/superscript CO2 variants (CO₂ → CO2)
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[₀-₉]/g, (c) => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(c)))
    .replace(/[⁰-⁹]/g, (c) => String('⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)))
    .replace(/[|\t\r\n]+/g, ' ')
    .replace(/[·•]/g, ' ')
    // EU locale numeric tokens: 2,19E+00 → 2.19E+00. Fold when the comma
    // sits between digits — but not in prose ("hello, world").
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Return true if any 4-token contiguous window of `snippet` occurs in
 * `haystack`. Using windows lets us match a snippet the model paraphrased
 * or partially quoted from a table row.
 */
function fuzzyContains(haystack: string, snippet: string): boolean {
  const H = normalize(haystack);
  const S = normalize(snippet);
  if (H.includes(S)) return true;
  const tokens = S.split(' ').filter((t) => t.length > 1);
  if (tokens.length < 4) return H.includes(S);
  const W = 4;
  for (let i = 0; i + W <= tokens.length; i++) {
    const window = tokens.slice(i, i + W).join(' ');
    if (H.includes(window)) return true;
  }
  return false;
}

// -- checks ---------------------------------------------------------

type Issue = { severity: 'error' | 'warn'; scope: string; message: string };

function checkSourceHash(epd: Epd, pdfPath: string, issues: Issue[]) {
  if (!existsSync(pdfPath)) {
    issues.push({ severity: 'error', scope: 'source', message: `PDF not found: ${pdfPath}` });
    return;
  }
  const actual = sha256File(pdfPath);
  if (actual !== epd.sourceFileHash) {
    issues.push({
      severity: 'error',
      scope: 'source',
      message: `sourceFileHash mismatch — record says ${epd.sourceFileHash.slice(0, 12)}…, file is ${actual.slice(0, 12)}…`,
    });
  }
}

function collectProvenances(epd: Epd): Array<{ where: string; prov: Provenance }> {
  const out: Array<{ where: string; prov: Provenance }> = [];
  const push = (where: string, prov: Provenance | undefined | null) => {
    if (prov) out.push({ where, prov });
  };
  push('manufacturer', epd.manufacturer.provenance);
  push('productName', epd.productName.provenance);
  push('declarationNumber', epd.declarationNumber?.provenance);
  push('standard', epd.standard.provenance);
  push('functionalUnit', epd.functionalUnit.provenance);
  push('compressiveStrength', epd.compressiveStrength?.provenance);
  push('manufacturingLocation', epd.manufacturingLocation.provenance);
  for (const stage of LCA_STAGES) {
    const v = epd.lifeCycle[stage];
    if (v && v.declared) push(`lifeCycle.${stage}`, v.provenance);
  }
  return out;
}

function checkPageBounds(epd: Epd, totalPages: number, issues: Issue[]) {
  for (const { where, prov } of collectProvenances(epd)) {
    if (prov.pageNumber < 1 || prov.pageNumber > totalPages) {
      issues.push({
        severity: 'error',
        scope: 'pageBounds',
        message: `${where}: pageNumber=${prov.pageNumber} out of [1, ${totalPages}]`,
      });
    }
  }
}

function checkSnippetGrounding(epd: Epd, pdfPath: string, totalPages: number, issues: Issue[]) {
  const pageTextCache = new Map<number, string>();
  const getPage = (n: number): string => {
    if (pageTextCache.has(n)) return pageTextCache.get(n)!;
    const t = pdfPageText(pdfPath, n);
    pageTextCache.set(n, t);
    return t;
  };
  for (const { where, prov } of collectProvenances(epd)) {
    if (prov.pageNumber < 1 || prov.pageNumber > totalPages) continue;
    let hit = fuzzyContains(getPage(prov.pageNumber), prov.snippet);
    // Some publishers straddle a row across two pages. Try neighbours.
    if (!hit && prov.pageNumber > 1) hit = fuzzyContains(getPage(prov.pageNumber - 1), prov.snippet);
    if (!hit && prov.pageNumber < totalPages) hit = fuzzyContains(getPage(prov.pageNumber + 1), prov.snippet);
    if (!hit) {
      issues.push({
        severity: 'warn',
        scope: 'snippetGrounding',
        message: `${where} @ p.${prov.pageNumber}: snippet not found by fuzzy match (likely graphical table; verify manually)`,
      });
    }
  }
}

/**
 * EN 15804+A2 §7.2: GWP-total = GWP-fossil + GWP-biogenic + GWP-luluc.
 * We tolerate:
 *   - 1% relative error (rounding to 3 sig figs is common)
 *   - 0.5 kg CO2e absolute floor (handles small stages where relative error
 *     blows up around near-zero values)
 */
function checkGwpFormula(epd: Epd, issues: Issue[]) {
  for (const stage of LCA_STAGES) {
    const v = epd.lifeCycle[stage];
    if (!v || !isDeclared(v)) continue;
    const total = v.gwpTotal;
    const f = v.gwpFossil;
    const b = v.gwpBiogenic;
    const l = v.gwpLuluc;
    if (typeof f !== 'number' || typeof b !== 'number' || typeof l !== 'number') continue;
    const sum = f + b + l;
    const diff = Math.abs(total - sum);
    const rel = diff / Math.max(1e-9, Math.abs(total));
    if (diff > 0.5 && rel > 0.01) {
      issues.push({
        severity: 'error',
        scope: 'gwpFormula',
        message: `lifeCycle.${stage}: total=${total}, fossil+biogenic+luluc=${sum.toFixed(4)}, |Δ|=${diff.toFixed(4)} (${(rel * 100).toFixed(2)}%)`,
      });
    }
  }
}

function checkPositive(epd: Epd, issues: Issue[]) {
  if (epd.functionalUnit.quantity <= 0) {
    issues.push({ severity: 'error', scope: 'sanity', message: `functionalUnit.quantity=${epd.functionalUnit.quantity} not positive` });
  }
  const cs = epd.compressiveStrength;
  if (cs && cs.valueMpa != null && cs.valueMpa <= 0) {
    issues.push({ severity: 'error', scope: 'sanity', message: `compressiveStrength.valueMpa=${cs.valueMpa} not positive` });
  }
}

// -- main -----------------------------------------------------------

function verifyOne(file: string): { id: string; issues: Issue[] } {
  const raw = JSON.parse(readFileSync(join(DATA_DIR, file), 'utf-8'));
  const parsed = EpdSchema.safeParse(raw);
  const id = basename(file, '.json');
  if (!parsed.success) {
    const issues: Issue[] = parsed.error.issues.slice(0, 10).map((i) => ({
      severity: 'error',
      scope: 'schema',
      message: `${i.path.join('.')}: ${i.message}`,
    }));
    return { id, issues };
  }
  const epd = parsed.data;
  const pdfPath = join(SOURCES_DIR, epd.sourceFile);
  const issues: Issue[] = [];
  checkSourceHash(epd, pdfPath, issues);
  if (!existsSync(pdfPath)) return { id: epd.id, issues };
  const totalPages = pdfPageCount(pdfPath);
  checkPageBounds(epd, totalPages, issues);
  checkPositive(epd, issues);
  checkGwpFormula(epd, issues);
  checkSnippetGrounding(epd, pdfPath, totalPages, issues);
  return { id: epd.id, issues };
}

function main() {
  const { only, strict } = parseArgs();
  const files = readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.json'))
    .filter((f) => !only || f.toLowerCase().includes(only.toLowerCase()))
    .sort();
  console.log(`Verifying ${files.length} EPD record${files.length === 1 ? '' : 's'}…\n`);

  let ok = 0;
  let errored = 0;
  let warned = 0;
  const failures: string[] = [];

  for (const f of files) {
    const { id, issues } = verifyOne(f);
    const errs = issues.filter((i) => i.severity === 'error');
    const wrns = issues.filter((i) => i.severity === 'warn');
    const marker = errs.length ? '✗' : wrns.length ? '⚠' : '✓';
    console.log(`${marker} ${id} — ${errs.length} error / ${wrns.length} warn`);
    for (const i of issues) {
      console.log(`    [${i.severity} · ${i.scope}] ${i.message}`);
    }
    if (errs.length) {
      errored++;
      failures.push(id);
    } else if (wrns.length) {
      warned++;
    } else {
      ok++;
    }
  }

  console.log(`\nTotal: ${ok} ok / ${warned} warn / ${errored} error`);
  if (errored > 0 || (strict && warned > 0)) {
    console.log(`\nFailures:`);
    for (const id of failures) console.log(`  • ${id}`);
    process.exit(1);
  }
}

main();
