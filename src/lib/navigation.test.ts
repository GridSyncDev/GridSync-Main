import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

test("the map header links to Source Intake and the existing return link remains", async () => {
  const [map, ingest] = await Promise.all([
    readFile(path.join(process.cwd(), "src", "components", "GridSyncApp.tsx"), "utf8"),
    readFile(path.join(process.cwd(), "src", "app", "ingest", "page.tsx"), "utf8"),
  ]);

  assert.match(map, /import Link from "next\/link"/);
  assert.match(map, /<Link\s+href="\/ingest"[\s\S]*?>\s*\+ Add public plan\s*<\/Link>/);
  assert.match(ingest, /<Link href="\/"[\s\S]*?>\s*Back to map\s*<\/Link>/);
});


