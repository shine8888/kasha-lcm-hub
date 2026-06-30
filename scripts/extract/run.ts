/**
 * Extraction runner — one EPD PDF → one validated JSON file.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=... npx tsx scripts/extract/run.ts
 *   ANTHROPIC_API_KEY=... npx tsx scripts/extract/run.ts --only EPD_HUB-5210
 *   ANTHROPIC_API_KEY=... npx tsx scripts/extract/run.ts --src ~/Downloads/epds
 *
 * Reads PDFs from --src (default ~/Downloads/epds).
 * Writes JSON to /data/<id>.json.
 * Copies the PDF to /public/sources/<id>.pdf so the app can serve provenance links.
 */
// Next.js-style env loading: .env.local takes precedence over .env, both relative
// to the project root. Done before importing anything that reads process.env.
import { config as loadDotenv } from 'dotenv';
import { resolve as _resolve } from 'node:path';
loadDotenv({ path: _resolve(__dirname, '..', '..', '.env.local') });
loadDotenv({ path: _resolve(__dirname, '..', '..', '.env') });

import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve, join, basename, extname } from 'node:path';

import { EpdSchema, type Epd } from '../../src/lib/schema';
import { EXTRACTION_SYSTEM_PROMPT } from './prompt';

const MODEL = process.env.EXTRACTION_MODEL ?? 'claude-sonnet-4-6';
const MAX_TOKENS = 16_000;

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return {
    src: get('--src') ?? join(homedir(), 'Downloads', 'epds'),
    only: get('--only'),
    force: args.includes('--force'),
  };
}

function expandHome(p: string): string {
  return p.startsWith('~') ? p.replace(/^~/, homedir()) : p;
}

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

async function extractOne(client: Anthropic, pdfPath: string, dataDir: string, sourcesDir: string) {
  const file = basename(pdfPath);
  const id = basename(file, extname(file));
  const buf = readFileSync(pdfPath);
  const hash = sha256(buf);
  const base64 = buf.toString('base64');

  console.log(`[${id}] ${(buf.byteLength / 1024 / 1024).toFixed(2)} MB → ${MODEL}`);
  const started = Date.now();

  const userText = `Extract from the attached EPD PDF.

The runner has set these fields for you — use them verbatim in your output:
- id: "${id}"
- sourceFile: "${file}"
- sourceFileHash: "${hash}"
- extractor.model: "${MODEL}"
- extractor.schemaVersion: "1"

Set extractedAt to "${new Date().toISOString()}".`;

  // Force structured output via tool_use. The model can't emit prose
  // outside the tool call, so a "Looking at this document…" preamble
  // can't sneak in before the JSON.
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: EXTRACTION_SYSTEM_PROMPT,
    tools: [
      {
        name: 'submit_epd',
        description: 'Submit the extracted EPD record. The input must match the schema described in the system prompt.',
        // The Anthropic API requires a JSON-Schema-shaped input_schema. We
        // keep it permissive here because the canonical contract is Zod —
        // the runner validates the tool_input with Zod before writing.
        input_schema: { type: 'object', additionalProperties: true },
      },
    ],
    tool_choice: { type: 'tool', name: 'submit_epd' },
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64 },
          },
          { type: 'text', text: userText },
        ],
      },
    ],
  });

  const toolUse = msg.content.find((b) => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error(`[${id}] no tool_use block in response — content blocks: ${msg.content.map((b) => b.type).join(', ')}`);
  }
  const raw = JSON.stringify(toolUse.input);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`[${id}] JSON.parse failed: ${(e as Error).message}\nFirst 400 chars: ${raw.slice(0, 400)}`);
  }

  const result = EpdSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 8)
      .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`[${id}] schema validation failed:\n${issues}\n(first 8 of ${result.error.issues.length} issues)`);
  }
  const epd: Epd = result.data;

  const outJson = join(dataDir, `${id}.json`);
  writeFileSync(outJson, JSON.stringify(epd, null, 2));

  const outPdf = join(sourcesDir, `${id}.pdf`);
  copyFileSync(pdfPath, outPdf);

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`[${id}] ✓ ${elapsed}s · usage: ${msg.usage.input_tokens} in / ${msg.usage.output_tokens} out`);
}

async function main() {
  const { src, only, force } = parseArgs();
  const srcDir = expandHome(src);
  const root = resolve(__dirname, '..', '..');
  const dataDir = join(root, 'data');
  const sourcesDir = join(root, 'public', 'sources');

  if (!existsSync(srcDir)) {
    console.error(`Source dir not found: ${srcDir}\nDownload the 20 PDFs from the assessment Drive folder into ${srcDir}.`);
    process.exit(1);
  }
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(sourcesDir, { recursive: true });

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set. `export ANTHROPIC_API_KEY=...` and retry.');
    process.exit(1);
  }
  const client = new Anthropic();

  const all = readdirSync(srcDir)
    .filter((f) => f.toLowerCase().endsWith('.pdf'))
    .sort();
  if (all.length === 0) {
    console.error(`No PDFs in ${srcDir}.`);
    process.exit(1);
  }
  const pdfs = only ? all.filter((f) => f.includes(only)) : all;
  console.log(`Found ${pdfs.length} PDF${pdfs.length === 1 ? '' : 's'} to process.`);

  let ok = 0;
  let failed = 0;
  const failures: Array<{ id: string; error: string }> = [];

  for (const f of pdfs) {
    const id = basename(f, extname(f));
    const outJson = join(dataDir, `${id}.json`);
    if (!force && existsSync(outJson)) {
      console.log(`[${id}] skip (already extracted; pass --force to redo)`);
      ok++;
      continue;
    }
    try {
      await extractOne(client, join(srcDir, f), dataDir, sourcesDir);
      ok++;
    } catch (e) {
      const err = (e as Error).message;
      console.error(err);
      failures.push({ id, error: err.split('\n')[0] });
      failed++;
    }
  }

  console.log(`\nDone — ${ok} ok / ${failed} failed`);
  if (failures.length) {
    console.log('Failures:');
    for (const f of failures) console.log(`  • ${f.id}: ${f.error}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
