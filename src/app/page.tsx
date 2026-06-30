import Link from 'next/link';

import { Filters } from '@/components/Filters';
import { NotDeclared } from '@/components/Provenance';
import { declaredStageCount, headlineGwp, listLocations, loadAllEpds, locationLabel, strengthRange } from '@/lib/data';
import { LCA_STAGES } from '@/lib/schema';
import type { Epd } from '@/lib/schema';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function getStr(sp: Awaited<SearchParams>, k: string): string | undefined {
  const v = sp[k];
  return Array.isArray(v) ? v[0] : v;
}

function applyFilters(epds: Epd[], sp: Awaited<SearchParams>): Epd[] {
  const location = getStr(sp, 'location');
  const minMpa = Number(getStr(sp, 'minMpa') ?? '');
  const maxMpa = Number(getStr(sp, 'maxMpa') ?? '');
  const sort = getStr(sp, 'sort') ?? 'gwp-asc';

  let out = epds.filter((e) => {
    if (location && locationLabel(e) !== location) return false;
    const mpa = e.compressiveStrength?.valueMpa ?? null;
    if (!Number.isNaN(minMpa) && minMpa && (mpa === null || mpa < minMpa)) return false;
    if (!Number.isNaN(maxMpa) && maxMpa && (mpa === null || mpa > maxMpa)) return false;
    return true;
  });

  out = [...out].sort((a, b) => {
    const ag = headlineGwp(a);
    const bg = headlineGwp(b);
    switch (sort) {
      case 'gwp-asc':
        if (ag === null && bg === null) return 0;
        if (ag === null) return 1;
        if (bg === null) return -1;
        return ag - bg;
      case 'gwp-desc':
        if (ag === null && bg === null) return 0;
        if (ag === null) return 1;
        if (bg === null) return -1;
        return bg - ag;
      case 'strength-desc':
        return (b.compressiveStrength?.valueMpa ?? -Infinity) - (a.compressiveStrength?.valueMpa ?? -Infinity);
      case 'name':
        return a.productName.value.localeCompare(b.productName.value);
      default:
        return 0;
    }
  });
  return out;
}

export default async function HomePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  let epds: Epd[];
  try {
    epds = loadAllEpds();
  } catch (e) {
    return (
      <EmptyState
        title="No extracted data yet"
        body={(e as Error).message}
      />
    );
  }
  if (epds.length === 0) {
    return (
      <EmptyState
        title="No extracted data yet"
        body={`Run "npm run extract" with ANTHROPIC_API_KEY set to populate /data/*.json from the source PDFs in ~/Downloads/epds/.`}
      />
    );
  }

  const filtered = applyFilters(epds, sp);
  const locations = listLocations(epds);
  const strength = strengthRange(epds);
  const selected = {
    location: getStr(sp, 'location'),
    minMpa: getStr(sp, 'minMpa'),
    maxMpa: getStr(sp, 'maxMpa'),
    sort: getStr(sp, 'sort'),
  };

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Concrete products by embodied carbon</h1>
        <p className="max-w-2xl text-sm text-stone-600">
          {epds.length} EPDs, extracted from publisher PDFs. The headline column shows{' '}
          <strong>A1–A3 (Product stage)</strong> GWP per declared functional unit. Click a row for the full
          life-cycle table and source provenance.
        </p>
      </section>

      <Filters locations={locations} strength={strength} selected={selected} />

      <form action="/compare" method="get" className="flex flex-col gap-3">
        <section className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wider text-stone-500">
              <tr>
                <th className="w-10 px-4 py-3 font-medium" aria-label="Select" />
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">Manufacturer</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Strength</th>
                <th className="px-4 py-3 font-medium">Functional unit</th>
                <th className="px-4 py-3 text-right font-medium">A1–A3 GWP</th>
                <th className="px-4 py-3 text-center font-medium" title="How many EN 15804 stages this EPD declares">Stages</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filtered.map((e) => {
                const gwp = headlineGwp(e);
                const fu = e.functionalUnit;
                return (
                  <tr key={e.id} className="hover:bg-stone-50">
                    <td className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        name="ids"
                        value={e.id}
                        aria-label={`Select ${e.productName.value} for comparison`}
                        className="h-4 w-4 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/products/${e.id}`} className="font-medium text-stone-900 hover:underline">
                        {e.productName.value}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-stone-700">{e.manufacturer.value}</td>
                    <td className="px-4 py-3 text-stone-700">{locationLabel(e)}</td>
                    <td className="px-4 py-3 text-stone-700">
                      {e.compressiveStrength?.valueMpa != null
                        ? `${e.compressiveStrength.valueMpa} MPa`
                        : <span className="text-stone-400">—</span>}
                      {e.compressiveStrength?.strengthClass && (
                        <span className="ml-2 text-xs text-stone-500">({e.compressiveStrength.strengthClass})</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-stone-600">
                      {fu.quantity} {fu.unit}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {gwp !== null ? (
                        <>
                          <span className="font-semibold">{gwp.toLocaleString()}</span>
                          <span className="ml-1 text-xs text-stone-500">kg CO₂e</span>
                        </>
                      ) : (
                        <NotDeclared />
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className="font-mono text-xs text-stone-600"
                        title={`Declares ${declaredStageCount(e)} of ${LCA_STAGES.length} EN 15804 life-cycle stages`}
                      >
                        {declaredStageCount(e)}/{LCA_STAGES.length}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-stone-500">
                    No products match these filters. <Link href="/" className="underline">Reset</Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        <div className="flex items-center justify-between">
          <p className="text-xs text-stone-500">
            Showing {filtered.length} of {epds.length}. Click a row for stage-by-stage data, or check the
            boxes and tap “Compare selected”.
          </p>
          <button
            type="submit"
            className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-800"
          >
            Compare selected →
          </button>
        </div>
      </form>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-stone-300 bg-white p-12 text-center">
      <h1 className="text-lg font-semibold">{title}</h1>
      <pre className="max-w-2xl whitespace-pre-wrap text-left text-xs text-stone-600">{body}</pre>
    </div>
  );
}
