import GridSyncApp from "@/components/GridSyncApp";
import { loadDataset } from "@/lib/data";

export default async function Home() {
  const dataset = await loadDataset();
  return <GridSyncApp dataset={dataset} />;
}
