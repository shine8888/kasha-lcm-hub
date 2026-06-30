import Link from 'next/link';
import { notFound } from 'next/navigation';

import { NotDeclared, ProvenanceLink } from '@/components/Provenance';
import { loadAllEpds, loadEpdById } from '@/lib/data';
import { LCA_STAGES, LCA_STAGE_LABELS, type LcaStage, isDeclared } from '@/lib/schema';

export function generateStaticParams() {
  try {
    return loadAllEpds().map((e) => ({ id: e.id }));
  } catch {
    return [];
  }
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const epd = loadEpdById(id);
  if (!epd) notFound();

  const declaredCount = (LCA_STAGES as readonly LcaStage[]).filter((s) => isDeclared(epd.lifeCycle[s])).length;

  return (
    <div className="flex flex-col gap-6">
      <nav className="text-sm">
        <Link href="/" className="text-stone-500 hover:text-stone-900">
          ← All products
        </Link>
      </nav>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{epd.productName.value}</h1>
            <ProvenanceLink sourceFile={epd.sourceFile} provenance={epd.productName.provenance} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-stone-600">
            <span>{epd.manufacturer.value}</span>
            <ProvenanceLink sourceFile={epd.sourceFile} provenance={epd.manufacturer.provenance} />
            <span aria-hidden>·</span>
            <span>{epd.manufacturingLocation.country}</span>
            <ProvenanceLink sourceFile={epd.sourceFile} provenance={epd.manufacturingLocation.provenance} />
          </div>
        </div>
        <a
          href={`/sources/${epd.id}.pdf`}
          target="_blank"
          rel="noreferrer"
          className="self-start rounded-md border border-stone-300 bg-white px-3 py-1.5 text-xs text-stone-700 hover:bg-stone-50"
        >
          Open source EPD →
        </a>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <Spec label="Functional unit" value={`${epd.functionalUnit.quantity} ${epd.functionalUnit.unit}`} prov={{ sourceFile: epd.sourceFile, provenance: epd.functionalUnit.provenance }} />
        <Spec
          label="Compressive strength"
          value={
            epd.compressiveStrength?.valueMpa != null
              ? `${epd.compressiveStrength.valueMpa} MPa${epd.compressiveStrength.strengthClass ? ` (${epd.compressiveStrength.strengthClass})` : ''}`
              : '—'
          }
          prov={epd.compressiveStrength ? { sourceFile: epd.sourceFile, provenance: epd.compressiveStrength.provenance } : undefined}
        />
        <Spec label="Standard" value={epd.standard.name} prov={{ sourceFile: epd.sourceFile, provenance: epd.standard.provenance }} />
        <Spec label="Manufacturing site" value={[epd.manufacturingLocation.plant, epd.manufacturingLocation.city, epd.manufacturingLocation.country].filter(Boolean).join(', ')} prov={{ sourceFile: epd.sourceFile, provenance: epd.manufacturingLocation.provenance }} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-end justify-between">
          <h2 className="text-lg font-semibold">Life-cycle GWP, stage by stage</h2>
          <span className="text-xs text-stone-500">
            {declaredCount} of {LCA_STAGES.length} stages declared
          </span>
        </div>
        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wider text-stone-500">
              <tr>
                <th className="px-4 py-3 font-medium">Stage</th>
                <th className="px-4 py-3 text-right font-medium">GWP total</th>
                <th className="px-4 py-3 text-right font-medium">Fossil</th>
                <th className="px-4 py-3 text-right font-medium">Biogenic</th>
                <th className="px-4 py-3 font-medium">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {LCA_STAGES.map((stage) => {
                const v = epd.lifeCycle[stage];
                return (
                  <tr key={stage} className={isDeclared(v) ? '' : 'bg-stone-50/50'}>
                    <td className="px-4 py-2 font-medium">{LCA_STAGE_LABELS[stage]}</td>
                    {isDeclared(v) ? (
                      <>
                        <td className="px-4 py-2 text-right font-mono">
                          {v.gwpTotal.toLocaleString()} <span className="text-xs text-stone-500">{v.unit}</span>
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-stone-600">
                          {v.gwpFossil != null ? v.gwpFossil.toLocaleString() : <span className="text-stone-400">—</span>}
                        </td>
                        <td className="px-4 py-2 text-right font-mono text-stone-600">
                          {v.gwpBiogenic != null ? v.gwpBiogenic.toLocaleString() : <span className="text-stone-400">—</span>}
                        </td>
                        <td className="px-4 py-2">
                          <ProvenanceLink sourceFile={epd.sourceFile} provenance={v.provenance} />
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2 text-right">
                          <NotDeclared reason={!v ? 'Absent from results table' : v.reason ?? undefined} />
                        </td>
                        <td colSpan={3} className="px-4 py-2 text-xs italic text-stone-500">
                          {!v
                            ? 'This stage is not listed in the EPD results table — treat as missing, not zero.'
                            : (v.reason ?? 'Reported as MND / Module Not Declared.')}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {epd.notes.length > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
          <h3 className="mb-2 font-semibold text-amber-900">Caveats from extraction</h3>
          <ul className="list-inside list-disc space-y-1 text-amber-900/90">
            {epd.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Spec({
  label,
  value,
  prov,
}: {
  label: string;
  value: string;
  prov?: { sourceFile: string; provenance: import('@/lib/schema').Provenance };
}) {
  return (
    <div className="rounded-lg border border-stone-200 bg-white p-3">
      <div className="text-xs uppercase tracking-wider text-stone-500">{label}</div>
      <div className="mt-1 flex items-center gap-2 text-sm">
        <span className="font-medium text-stone-900">{value}</span>
        {prov && <ProvenanceLink sourceFile={prov.sourceFile} provenance={prov.provenance} />}
      </div>
    </div>
  );
}
