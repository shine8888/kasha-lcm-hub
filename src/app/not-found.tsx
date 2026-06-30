import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <h1 className="text-xl font-semibold">Not found</h1>
      <p className="text-sm text-stone-600">That EPD isn’t in the dataset.</p>
      <Link href="/" className="text-sm underline">
        ← Back to the product list
      </Link>
    </div>
  );
}
