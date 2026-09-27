import GridSyncApp from "@/components/GridSyncApp";
import { loadDatasetWithSource } from "@/lib/data";

// Read the database at request time, not at build time.
export const dynamic = "force-dynamic";

export default async function Home() {
  const { dataset, source } = await loadDatasetWithSource();
  return <GridSyncApp dataset={dataset} source={source} />;
}
