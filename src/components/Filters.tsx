import Link from 'next/link';

/**
 * Server component. Renders a plain HTML <form method="get"> so the filters
 * are reflected in the URL — shareable, no client state, no hydration cost.
 */
export function Filters({
  locations,
  strength,
  selected,
}: {
  locations: string[];
  strength: { min: number; max: number } | null;
  selected: { location?: string; minMpa?: string; maxMpa?: string; sort?: string };
}) {
  return (
    <form
      method="get"
      className="flex flex-wrap items-end gap-3 rounded-lg border border-stone-200 bg-white p-4"
    >
      <div className="flex flex-col">
        <label className="mb-1 text-xs font-medium text-stone-600" htmlFor="location">
          Manufacturing location
        </label>
        <select
          id="location"
          name="location"
          defaultValue={selected.location ?? ''}
          className="rounded border border-stone-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="">All</option>
          {locations.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      {strength && (
        <>
          <div className="flex flex-col">
            <label className="mb-1 text-xs font-medium text-stone-600" htmlFor="minMpa">
              Min strength (MPa)
            </label>
            <input
              id="minMpa"
              name="minMpa"
              type="number"
              min={strength.min}
              max={strength.max}
              defaultValue={selected.minMpa ?? ''}
              placeholder={String(strength.min)}
              className="w-24 rounded border border-stone-300 bg-white px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex flex-col">
            <label className="mb-1 text-xs font-medium text-stone-600" htmlFor="maxMpa">
              Max strength (MPa)
            </label>
            <input
              id="maxMpa"
              name="maxMpa"
              type="number"
              min={strength.min}
              max={strength.max}
              defaultValue={selected.maxMpa ?? ''}
              placeholder={String(strength.max)}
              className="w-24 rounded border border-stone-300 bg-white px-2 py-1.5 text-sm"
            />
          </div>
        </>
      )}

      <div className="flex flex-col">
        <label className="mb-1 text-xs font-medium text-stone-600" htmlFor="sort">
          Sort by
        </label>
        <select
          id="sort"
          name="sort"
          defaultValue={selected.sort ?? 'gwp-asc'}
          className="rounded border border-stone-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="gwp-asc">A1–A3 GWP — low → high</option>
          <option value="gwp-desc">A1–A3 GWP — high → low</option>
          <option value="strength-desc">Strength — high → low</option>
          <option value="name">Product name</option>
        </select>
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
        >
          Apply
        </button>
        <Link
          href="/"
          className="rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
        >
          Reset
        </Link>
      </div>
    </form>
  );
}
