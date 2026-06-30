import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { EpdSchema, LCA_STAGES, type Epd, type LcaStage, isDeclared } from './schema';

const DATA_DIR = join(process.cwd(), 'data');

let cache: Epd[] | null = null;

/**
 * Server-only. Reads /data/*.json once per process and validates each
 * against the schema. A malformed file is surfaced loudly — better than
 * silently rendering bad provenance.
 */
export function loadAllEpds(): Epd[] {
  if (cache) return cache;
  const files = readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();
  const out: Epd[] = [];
  for (const f of files) {
    const raw = readFileSync(join(DATA_DIR, f), 'utf-8');
    const parsed = EpdSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      throw new Error(
        `[/data/${f}] failed schema validation:\n` +
          parsed.error.issues.slice(0, 5).map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n'),
      );
    }
    out.push(parsed.data);
  }
  cache = out;
  return out;
}

export function loadEpdById(id: string): Epd | undefined {
  return loadAllEpds().find((e) => e.id === id);
}

/** A1-A3 GWP per functional unit — the headline "embodied carbon" metric. */
export function headlineGwp(epd: Epd): number | null {
  const s = epd.lifeCycle['A1-A3'];
  return isDeclared(s) ? s.gwpTotal : null;
}

/**
 * Location label for filtering. Uses region (state/province) when present,
 * falling back to country. With this dataset (all 20 are Australian) the
 * region is the only filter axis with signal — country would just show
 * "Australia" everywhere.
 */
export function locationLabel(epd: Epd): string {
  const loc = epd.manufacturingLocation;
  return loc.region?.trim() || loc.country;
}

/** Unique location labels across the dataset, sorted, for the filter dropdown. */
export function listLocations(epds: Epd[]): string[] {
  return [...new Set(epds.map(locationLabel))].sort();
}

/** Strength range — used to bound the slider on the list page. */
export function strengthRange(epds: Epd[]): { min: number; max: number } | null {
  const values = epds
    .map((e) => e.compressiveStrength?.valueMpa)
    .filter((v): v is number => typeof v === 'number');
  if (values.length === 0) return null;
  return { min: Math.floor(Math.min(...values)), max: Math.ceil(Math.max(...values)) };
}

/** How many of the 15 EN 15804 stages does this EPD declare? */
export function declaredStageCount(epd: Epd): number {
  return (LCA_STAGES as readonly LcaStage[]).filter((s) => isDeclared(epd.lifeCycle[s])).length;
}

export type StageGwp = { stage: LcaStage; gwp: number | null; declared: boolean };

/** Stage-by-stage GWP for a product, in canonical order. null means not declared. */
export function stageGwpRow(epd: Epd, stages: readonly LcaStage[]): StageGwp[] {
  return stages.map((stage) => {
    const v = epd.lifeCycle[stage];
    if (!v) return { stage, gwp: null, declared: false };
    return v.declared
      ? { stage, gwp: v.gwpTotal, declared: true }
      : { stage, gwp: null, declared: false };
  });
}
