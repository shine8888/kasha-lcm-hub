import Link from 'next/link';

import { NotDeclared, ProvenanceLink } from '@/components/Provenance';
import { headlineGwp, loadAllEpds } from '@/lib/data';
import { LCA_STAGES, LCA_STAGE_LABELS, type Epd, type LcaStage, isDeclared } from '@/lib/schema';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function collectIds(sp: Awaited<SearchParams>): string[] {
  const raw = sp.ids;
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  return list.flatMap((s) => s.split(',')).map((s) => s.trim()).filter(Boolean);
}

export default async function ComparePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const ids = collectIds(sp);
  const all = (() => {
    try {
      return loadAllEpds();
    } catch {
      return [];
    }
  })();

  if (ids.length === 0) {
    return <PickProducts all={all} />;
  }

  const products = ids
    .map((id) => all.find((e) => e.id === id))
    .filter((e): e is Epd => Boolean(e));

  if (products.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-semibold">No matching products</h1>
        <p className="text-sm text-stone-600">None of the IDs in the URL match a known product.</p>
        <Link href="/" className="text-sm underline">← Back to list</Link>
      </div>
    );
  }

  const functionalUnits = [...new Set(products.map((p) => `${p.functionalUnit.quantity} ${p.functionalUnit.unit}`))];
  const fuMismatch = functionalUnits.length > 1;

  const stageColspan = products.length;
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Compare {products.length} products</h1>
        <p className="text-sm text-stone-600">
          GWP values are <strong>per declared functional unit</strong> — the row below the product name.
          A blank cell or a “Not declared” badge means the EPD did not report that stage. <em>Do not</em>{' '}
          read it as zero.
        </p>
      </section>

      {fuMismatch && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <strong>Functional units don’t match</strong> across these products ({functionalUnits.join(', ')}).
          Direct comparison is not apples-to-apples. Convert to a shared basis before quoting any
          single number.
        </div>
      )}

      <section className="overflow-x-auto rounded-lg border border-stone-200 bg-white">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50">
              <th className="sticky left-0 z-10 bg-stone-50 px-4 py-3 text-left text-xs uppercase tracking-wider text-stone-500">
                Stage
              </th>
              {products.map((p) => (
                <th key={p.id} className="px-4 py-3 text-left align-top">
                  <div className="flex flex-col gap-1">
                    <Link href={`/products/${p.id}`} className="text-sm font-semibold text-stone-900 hover:underline">
                      {p.productName.value}
                    </Link>
                    <span className="text-xs text-stone-500">{p.manufacturer.value}</span>
                    <span className="text-xs text-stone-500">
                      {p.functionalUnit.quantity} {p.functionalUnit.unit}
                      {' · '}
                      {p.compressiveStrength?.valueMpa != null
                        ? `${p.compressiveStrength.valueMpa} MPa`
                        : 'strength: n/a'}
                      {' · '}
                      {p.manufacturingLocation.country}
                    </span>
                    <RemoveLink ids={ids} drop={p.id} />
                  </div>
                </th>
              ))}
            </tr>
            <tr className="border-b border-stone-200 bg-stone-100/60 text-xs">
              <td className="sticky left-0 z-10 bg-stone-100/60 px-4 py-2 font-medium text-stone-600">
                Headline (A1–A3)
              </td>
              {products.map((p) => {
                const gwp = headlineGwp(p);
                return (
                  <td key={p.id} className="px-4 py-2">
                    {gwp != null ? (
                      <span className="font-mono text-sm font-semibold">{gwp.toLocaleString()} <span className="font-sans text-xs text-stone-500">kg CO₂e</span></span>
                    ) : (
                      <NotDeclared />
                    )}
                  </td>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {LCA_STAGES.map((stage) => (
              <StageRow key={stage} stage={stage} products={products} colspan={stageColspan} />
            ))}
          </tbody>
        </table>
      </section>

      <Link href="/" className="text-sm underline">← Back to list</Link>
    </div>
  );
}

function RemoveLink({ ids, drop }: { ids: string[]; drop: string }) {
  const remaining = ids.filter((id) => id !== drop);
  if (remaining.length === 0) {
    return (
      <Link href="/" className="text-xs text-stone-500 hover:text-stone-900 underline">
        remove
      </Link>
    );
  }
  return (
    <Link
      href={`/compare?${new URLSearchParams(remaining.map((id) => ['ids', id])).toString()}`}
      className="text-xs text-stone-500 hover:text-stone-900 underline"
    >
      remove
    </Link>
  );
}

function StageRow({ stage, products, colspan }: { stage: LcaStage; products: Epd[]; colspan: number }) {
  void colspan;
  return (
    <tr>
      <td className="sticky left-0 z-10 bg-white px-4 py-2 align-top font-medium">
        {LCA_STAGE_LABELS[stage]}
      </td>
      {products.map((p) => {
        const v = p.lifeCycle[stage];
        return (
          <td key={p.id} className="px-4 py-2 align-top">
            {isDeclared(v) ? (
              <div className="flex items-center gap-2">
                <span className="font-mono">{v.gwpTotal.toLocaleString()}</span>
                <span className="text-xs text-stone-500">{v.unit}</span>
                <ProvenanceLink sourceFile={p.sourceFile} provenance={v.provenance} />
              </div>
            ) : (
              <NotDeclared reason={!v ? 'Absent from EPD' : v.reason ?? undefined} />
            )}
          </td>
        );
      })}
    </tr>
  );
}

function PickProducts({ all }: { all: Epd[] }) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">Pick products to compare</h1>
      <p className="text-sm text-stone-600">
        Select two or more EPDs and click <strong>Compare</strong>. The next page shows their full
        life-cycle GWP side by side — including the stages each EPD chose <em>not</em> to declare.
      </p>
      <form method="get" className="flex flex-col gap-3">
        <div className="grid gap-2 rounded-lg border border-stone-200 bg-white p-3 sm:grid-cols-2">
          {all.map((e) => (
            <label
              key={e.id}
              className="flex cursor-pointer items-center gap-2 rounded p-2 hover:bg-stone-50"
            >
              <input type="checkbox" name="ids" value={e.id} className="h-4 w-4" />
              <span className="flex-1 text-sm">
                <span className="font-medium">{e.productName.value}</span>
                <span className="ml-1 text-stone-500">— {e.manufacturer.value}</span>
              </span>
            </label>
          ))}
          {all.length === 0 && (
            <p className="col-span-2 p-3 text-sm text-stone-500">
              No extracted data yet. Run <code>npm run extract</code> first.
            </p>
          )}
        </div>
        <button
          type="submit"
          className="self-start rounded bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
        >
          Compare
        </button>
      </form>
    </div>
  );
}
