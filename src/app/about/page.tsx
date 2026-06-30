import Link from 'next/link';

export const metadata = {
  title: 'About the data — LCM Hub',
};

export default function AboutPage() {
  return (
    <article className="prose prose-stone max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">About the data</h1>

      <h2 className="mt-6 text-lg font-semibold">What this hub does</h2>
      <p className="text-sm text-stone-700">
        Concrete suppliers publish carbon data in Environmental Product Declarations (EPDs) —
        standardised but inconsistently filled PDFs. This hub extracts the GWP (global warming
        potential) numbers from a sample of 20 EPDs and presents them side by side so a
        non-expert builder can compare like-with-like — or at least, see clearly when they can&apos;t.
      </p>

      <h2 className="mt-6 text-lg font-semibold">The honesty rule</h2>
      <p className="text-sm text-stone-700">
        Every number on this site links back to the page of the EPD it came from. Hover any
        <code className="mx-1 rounded bg-stone-100 px-1 text-xs">p.N</code> link to see the verbatim
        snippet that grounded the value; click to open the source PDF at that page.
      </p>
      <p className="text-sm text-stone-700">
        A stage marked <strong>“Not declared”</strong> means the EPD did not report a number for that
        life-cycle module. It is <em>not</em> zero — treating it as zero would flatter products that
        chose to omit downstream impact, which is exactly the failure mode this site exists to
        prevent.
      </p>

      <h2 className="mt-6 text-lg font-semibold">What we extract</h2>
      <ul className="text-sm text-stone-700">
        <li>Manufacturer, product name, declaration number, validity dates</li>
        <li>Standard (EN 15804+A2, ISO 14025) and Product Category Rule</li>
        <li>Functional unit (typically 1 m³)</li>
        <li>Compressive strength (normalized to MPa, plus the verbatim strength class)</li>
        <li>Manufacturing location</li>
        <li>
          GWP per EN 15804 life-cycle stage: A1–A3 (Product), A4 (Transport to site), A5
          (Installation), B1–B7 (Use), C1–C4 (End of life), D (Benefits beyond system)
        </li>
      </ul>

      <h2 className="mt-6 text-lg font-semibold">What we don&apos;t do (yet)</h2>
      <ul className="text-sm text-stone-700">
        <li>Cross-functional-unit normalization. The compare page warns when EPDs report on different bases (e.g. 1 m³ vs 1 tonne); it does not convert.</li>
        <li>Non-GWP indicators (AP, EP, POCP, etc.). Out of scope for this sample.</li>
        <li>Multi-mix EPDs. When an EPD covers several concrete mixes, we extract the primary one and note the others as caveats on the detail page.</li>
        <li>Authentication, write paths, multi-user editing. The data is read-only — sourced from the PDFs at extraction time, not from user input.</li>
      </ul>

      <h2 className="mt-6 text-lg font-semibold">How the data got here</h2>
      <p className="text-sm text-stone-700">
        See <Link href="https://github.com/" className="underline">EXTRACTION.md</Link> in the repo
        for the extraction strategy, model choice, and accuracy methodology.
      </p>
    </article>
  );
}
