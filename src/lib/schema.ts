import { z } from 'zod';

/**
 * Every extracted carbon figure must trace back to its source EPD page.
 * Provenance is required on every value the app surfaces in a comparison.
 */
export const Provenance = z.object({
  pageNumber: z.number().int().positive(),
  snippet: z.string().min(1),
  confidence: z.enum(['high', 'medium', 'low']),
  method: z.enum(['vision-llm', 'manual', 'derived']),
});
export type Provenance = z.infer<typeof Provenance>;

/**
 * EN 15804+A2 life-cycle modules. We keep the full set so the app can
 * honestly render "not declared" for modules an EPD chose to omit.
 */
export const LCA_STAGES = [
  'A1-A3',
  'A4',
  'A5',
  'B1',
  'B2',
  'B3',
  'B4',
  'B5',
  'B6',
  'B7',
  'C1',
  'C2',
  'C3',
  'C4',
  'D',
] as const;
export type LcaStage = (typeof LCA_STAGES)[number];

export const LCA_STAGE_LABELS: Record<LcaStage, string> = {
  'A1-A3': 'Product (A1–A3)',
  A4: 'Transport to site (A4)',
  A5: 'Installation (A5)',
  B1: 'Use (B1)',
  B2: 'Maintenance (B2)',
  B3: 'Repair (B3)',
  B4: 'Replacement (B4)',
  B5: 'Refurbishment (B5)',
  B6: 'Operational energy (B6)',
  B7: 'Operational water (B7)',
  C1: 'Deconstruction (C1)',
  C2: 'Waste transport (C2)',
  C3: 'Waste processing (C3)',
  C4: 'Disposal (C4)',
  D: 'Beyond system (D)',
};

/**
 * Discriminated union — `declared: false` carries no value. The app must
 * render this as a "Not declared" badge, NEVER as 0. This is the core
 * honesty invariant of the schema.
 */
export const StageValue = z.discriminatedUnion('declared', [
  z.object({
    declared: z.literal(true),
    gwpTotal: z.number(),
    gwpFossil: z.number().nullable().optional(),
    gwpBiogenic: z.number().nullable().optional(),
    gwpLuluc: z.number().nullable().optional(),
    unit: z.string().default('kg CO2 eq.'),
    provenance: Provenance,
  }),
  z.object({
    declared: z.literal(false),
    /** Verbatim from the EPD when present: "MND", "Module Not Assessed", "—". */
    reason: z.string().nullable().optional(),
  }),
]);
export type StageValue = z.infer<typeof StageValue>;

const ProvField = <T extends z.ZodTypeAny>(value: T) =>
  z.object({ value, provenance: Provenance });

export const EpdSchema = z.object({
  id: z.string(),
  sourceFile: z.string(),
  sourceFileHash: z.string(),
  extractedAt: z.string(),
  extractor: z.object({
    model: z.string(),
    schemaVersion: z.literal('1'),
  }),

  manufacturer: ProvField(z.string()),
  productName: ProvField(z.string()),
  declarationNumber: ProvField(z.string()).nullable().optional(),
  publishedDate: z.string().nullable().optional(),
  validUntil: z.string().nullable().optional(),

  standard: z.object({
    name: z.string(),
    pcr: z.string().nullable().optional(),
    provenance: Provenance,
  }),

  functionalUnit: z.object({
    quantity: z.number().positive(),
    unit: z.string(),
    provenance: Provenance,
  }),

  /**
   * Concrete-specific. Normalized to MPa so the filter on the list page
   * can be a single numeric range. `strengthClass` (e.g. "C32/40") is
   * preserved verbatim from the EPD for honesty.
   */
  compressiveStrength: z
    .object({
      valueMpa: z.number().nullable(),
      strengthClass: z.string().nullable(),
      testAgeDays: z.number().nullable().optional(),
      provenance: Provenance,
    })
    .nullable()
    .optional(),

  manufacturingLocation: z.object({
    plant: z.string().nullable().optional(),
    city: z.string().nullable().optional(),
    region: z.string().nullable().optional(),
    country: z.string(),
    provenance: Provenance,
  }),

  /**
   * Partial — keys absent here render as "Not assessed" in the UI.
   * Modeled as an explicit object of optionals rather than z.record(enum, ...)
   * because zod v4 treats z.record over enum keys as exhaustive.
   */
  lifeCycle: z.object({
    'A1-A3': StageValue.optional(),
    A4: StageValue.optional(),
    A5: StageValue.optional(),
    B1: StageValue.optional(),
    B2: StageValue.optional(),
    B3: StageValue.optional(),
    B4: StageValue.optional(),
    B5: StageValue.optional(),
    B6: StageValue.optional(),
    B7: StageValue.optional(),
    C1: StageValue.optional(),
    C2: StageValue.optional(),
    C3: StageValue.optional(),
    C4: StageValue.optional(),
    D: StageValue.optional(),
  }),

  /** Free-form caveats the extractor flagged (unit mismatches, etc.). */
  notes: z.array(z.string()).default([]),
});

export type Epd = z.infer<typeof EpdSchema>;

export function isDeclared(
  s: StageValue | undefined,
): s is Extract<StageValue, { declared: true }> {
  return !!s && s.declared === true;
}
