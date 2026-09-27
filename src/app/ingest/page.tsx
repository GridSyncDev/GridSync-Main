import Link from "next/link";
import { loadDataset } from "@/lib/data";
import IngestClient from "@/components/ingest/IngestClient";

export const dynamic = "force-dynamic";

export default async function IngestPage() {
  const { utilities } = await loadDataset();
  return (
    <main className="h-screen overflow-y-auto bg-bg text-text">
      <div className="mx-auto max-w-6xl px-5 py-8">
        <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-share">GridSync / Source intake</p>
            <h1 className="mt-2 text-3xl font-semibold">Review a public plan</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Extract one project from pasted utility text, check its source quotes, complete the missing fields,
              then preview matches from GridSync’s existing overlap engine.
            </p>
          </div>
          <Link href="/" className="rounded-lg border border-line px-4 py-2 text-sm text-sky-300 hover:bg-white/5">
            Back to map
          </Link>
        </div>
        <IngestClient utilities={utilities.map(({ id, name, color }) => ({ id, name, color }))} />
      </div>
    </main>
  );
}
