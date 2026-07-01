import { describe, expect, it } from 'vitest';

import { declaredStageCount, headlineGwp, locationLabel } from './data';
import { LCA_STAGES, type Epd, type Provenance } from './schema';

const prov: Provenance = {
  pageNumber: 1,
  snippet: 'test',
  confidence: 'high',
  method: 'vision-llm',
};

// Minimal EPD fixture — every field the pure helpers touch, nothing else.
// Kept inline so the test is self-contained and reviewer can read it in one screen.
function fixture(overrides: Partial<Epd> = {}): Epd {
  const base: Epd = {
    id: 'test-fixture',
    sourceFile: 'test.pdf',
    sourceFileHash: 'x'.repeat(64),
    extractedAt: '2026-06-30T00:00:00Z',
    extractor: { model: 'test', schemaVersion: '1' },
    manufacturer: { value: 'Acme Cement', provenance: prov },
    productName: { value: 'EcoMix 32', provenance: prov },
    standard: { name: 'EN 15804+A2', provenance: prov },
    functionalUnit: { quantity: 1, unit: 'm3', provenance: prov },
    manufacturingLocation: { country: 'Australia', region: 'Victoria', provenance: prov },
    lifeCycle: {},
    notes: [],
  };
  return { ...base, ...overrides };
}

describe('headlineGwp', () => {
  it('returns A1-A3 gwpTotal when declared', () => {
    const epd = fixture({
      lifeCycle: {
        'A1-A3': { declared: true, gwpTotal: 275, unit: 'kg CO2e', provenance: prov },
      },
    });
    expect(headlineGwp(epd)).toBe(275);
  });

  it('returns null when A1-A3 is explicitly not declared', () => {
    const epd = fixture({
      lifeCycle: { 'A1-A3': { declared: false, reason: 'MND' } },
    });
    // This is the load-bearing "not declared ≠ zero" invariant:
    // headlineGwp must NEVER return 0 for a not-declared stage.
    expect(headlineGwp(epd)).toBeNull();
  });

  it('returns null when A1-A3 is absent from the record', () => {
    const epd = fixture({ lifeCycle: {} });
    expect(headlineGwp(epd)).toBeNull();
  });

  it('preserves negative values (module D can be a credit)', () => {
    const epd = fixture({
      lifeCycle: {
        'A1-A3': { declared: true, gwpTotal: -12.2, unit: 'kg CO2e', provenance: prov },
      },
    });
    expect(headlineGwp(epd)).toBe(-12.2);
  });
});

describe('declaredStageCount', () => {
  it('counts declared:true stages including zeros', () => {
    // Heidelberg-shape: A1-A3 declared with a real number, B-stages
    // declared with a zero (scenario assumes no impact), C-stages declared.
    // All 5 count — declared:true is what the count measures.
    const epd = fixture({
      lifeCycle: {
        'A1-A3': { declared: true, gwpTotal: 145, unit: 'kg CO2e', provenance: prov },
        B1: { declared: true, gwpTotal: 0, unit: 'kg CO2e', provenance: prov },
        C1: { declared: true, gwpTotal: 8.99, unit: 'kg CO2e', provenance: prov },
        C2: { declared: true, gwpTotal: 9.03, unit: 'kg CO2e', provenance: prov },
        D: { declared: false, reason: 'MND' },
      },
    });
    expect(declaredStageCount(epd)).toBe(4);
  });

  it('returns 0 when nothing is declared', () => {
    expect(declaredStageCount(fixture())).toBe(0);
  });

  it('caps at LCA_STAGES.length (15)', () => {
    const full = Object.fromEntries(
      LCA_STAGES.map((s) => [s, { declared: true, gwpTotal: 1, unit: 'kg CO2e', provenance: prov }]),
    ) as Epd['lifeCycle'];
    const epd = fixture({ lifeCycle: full });
    expect(declaredStageCount(epd)).toBe(LCA_STAGES.length);
    expect(declaredStageCount(epd)).toBe(15);
  });
});

describe('locationLabel', () => {
  it('prefers region when present', () => {
    const epd = fixture({
      manufacturingLocation: { country: 'Australia', region: 'Victoria', provenance: prov },
    });
    expect(locationLabel(epd)).toBe('Victoria');
  });

  it('falls back to country when region is empty', () => {
    const epd = fixture({
      manufacturingLocation: { country: 'Australia', region: '', provenance: prov },
    });
    expect(locationLabel(epd)).toBe('Australia');
  });

  it('falls back to country when region is missing', () => {
    const epd = fixture({
      manufacturingLocation: { country: 'Australia', provenance: prov },
    });
    expect(locationLabel(epd)).toBe('Australia');
  });

  it('trims whitespace-only region', () => {
    const epd = fixture({
      manufacturingLocation: { country: 'Australia', region: '   ', provenance: prov },
    });
    expect(locationLabel(epd)).toBe('Australia');
  });
});
