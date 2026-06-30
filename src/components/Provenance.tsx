import type { Provenance } from '@/lib/schema';

/**
 * Provenance link. Opens the source PDF at the cited page in a new tab.
 * The hover title carries the verbatim snippet that grounded the value.
 */
export function ProvenanceLink({
  sourceFile,
  provenance,
  label,
}: {
  sourceFile: string;
  provenance: Provenance;
  label?: string;
}) {
  const id = sourceFile.replace(/\.pdf$/i, '');
  const href = `/sources/${id}.pdf#page=${provenance.pageNumber}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={provenance.snippet}
      className="inline-flex items-center gap-1 rounded border border-stone-200 bg-stone-50 px-1.5 py-0.5 font-mono text-[10px] text-stone-600 hover:border-stone-400 hover:bg-white"
    >
      <span>p.{provenance.pageNumber}</span>
      {provenance.confidence !== 'high' && (
        <span
          className={
            provenance.confidence === 'medium'
              ? 'text-amber-700'
              : 'text-red-700'
          }
        >
          · {provenance.confidence}
        </span>
      )}
      {label && <span className="ml-1 text-stone-400">{label}</span>}
    </a>
  );
}

export function NotDeclared({ reason }: { reason?: string | null }) {
  return (
    <span
      title={reason ?? 'Not declared in this EPD. Treat as missing data, not zero.'}
      className="inline-flex items-center rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200"
    >
      Not declared
    </span>
  );
}
