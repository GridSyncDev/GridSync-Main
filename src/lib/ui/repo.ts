// Where the normalized data and the scripts that produced it live on GitHub, so every
// project on screen can be traced from the original document to our record of it.

export const REPO_URL = "https://github.com/GridSyncDev/GridSync-Main";
const BLOB = `${REPO_URL}/blob/main`;

export const DATA_URL = `${REPO_URL}/tree/main/data/projects`;
export const INGEST_URL = `${REPO_URL}/tree/main/ingest`;

export interface RepoSource {
  label: string;
  record: string; // normalized JSON file
  parser: string | null; // script that produced it (null = curated by hand)
}

/** The data file (and parser) a project came from, based on its id prefix. */
export function repoSourceFor(projectId: string): RepoSource {
  if (projectId.startsWith("sertp-"))
    return { label: "SERTP parser", record: `${BLOB}/data/projects/sertp.json`, parser: `${BLOB}/ingest/sertp.py` };
  if (projectId.startsWith("eia-"))
    return { label: "EIA-860M parser", record: `${BLOB}/data/projects/eia860m.json`, parser: `${BLOB}/ingest/eia860m.py` };
  return { label: "Curated from filings", record: `${BLOB}/data/projects/curated.json`, parser: null };
}
