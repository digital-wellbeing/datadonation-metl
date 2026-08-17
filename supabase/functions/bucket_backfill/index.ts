import { config as loadEnv } from "https://deno.land/x/dotenv@v3.2.0/mod.ts";
loadEnv({ export: true, path: ".env.local" });

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET       = "raw-json-uploads";
const TABLE        = "test_bucket";
const SOURCE_TABLE = "uploads";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

const PAGE_SIZE = 10;
const PAGE_FILE = "./last_page_copy.txt";
const TSV_FILE  = "./all_rows.tsv";

// Generic retry helper
async function retry<T>(fn: () => Promise<T>, retries = 3, delay = 500): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries > 0) {
      await new Promise(r => setTimeout(r, delay));
      return retry(fn, retries - 1, delay * 2);
    }
    throw err;
  }
}

// Download each object from storage
async function downloadToFile(key: string, dest: string): Promise<boolean> {
  const { data: blob, error } = await retry(() =>
    supabase.storage.from(BUCKET).download(key)
  );

  if (error) {
    if (error.status === 404) {
      console.warn(`⚠️  Missing file, skipping: ${key}`);
      return false;
    }
    throw error;
  }

  const buf = await blob.arrayBuffer();
  await Deno.writeFile(dest, new Uint8Array(buf));
  return true;
}

// Ensure TSV writer
async function ensureTsvWriter(): Promise<Deno.FsFile> {
  return await Deno.open(TSV_FILE, { create: true, write: true, append: true });
}

// Track pages
let page = 0;
try {
  page = Number((await Deno.readTextFile(PAGE_FILE)).trim()) || 0;
  console.log("Resuming from page", page);
} catch {
  console.log("Starting from page 0");
}

function normalizeJsonRows<T extends { json_data: string }>(rows: T[]): (T & { json_data: string })[] {
  return rows.map(row => {
    let parsed: unknown
    try {
      parsed = JSON.parse(row.json_data)
    } catch (err) {
      console.error(`✖️ invalid JSON for submission_id=${row.submission_id}`, err)
      // you can choose to throw, or skip invalid rows, or store null
      throw err
    }
    return {
      ...row,
      // compact: no spaces, consistent quoting
      json_data: JSON.stringify(parsed)
    }
  })
}

// Backfill storage objects to TSV, including created_at from metadata
async function backfillToTsv() {
  const writer = await ensureTsvWriter();

  while (true) {
    const offset = page * PAGE_SIZE;
    console.log(`\n➡️  Listing page ${page} (offset ${offset})`);

    const { data: objects, error: listErr } = await supabase
      .storage
      .from(BUCKET)
      .list("", { limit: PAGE_SIZE, offset });
    if (listErr) throw listErr;
    if (!objects || objects.length === 0) {
      console.log("🏁 No more objects.");
      break;
    }

    for (const obj of objects) {
      console.log(`\n--- Processing ${obj.name} ---`);

      // obj already has a created_at field from .list()
      const createdAt = obj.created_at;
      console.log(`→ obj.created_at from list(): ${createdAt}`);

      // parse submissionId
      const dotJson      = obj.name.replace(/\.json$/i, "");
      const sepIndex     = dotJson.indexOf("_");
      const submissionId = Number(dotJson.slice(0, sepIndex));
      const platform     = "TikTok";

      // Download the file
      const tmp = `./tmp_${submissionId}.json`;
      const ok  = await downloadToFile(obj.name, tmp);
      if (!ok) continue;

      // Read & escape JSON
      let raw = await Deno.readTextFile(tmp);
      raw = raw.replace(/\t/g, "\\t").replace(/\r?\n/g, "\\n");
      const jsonEscaped = raw.replace(/"/g, '""');

      // Build a bullet-proof 4-column TSV line
      const cols = [
        submissionId.toString(),
        platform,
        `"${jsonEscaped}"`,
        createdAt ? `"${createdAt}"` : `"${new Date().toISOString()}"`
      ];
      const line = cols.join("\t") + "\n";

      // DEBUG: show the first 200 characters
      console.log("TSV line preview:", line.slice(0, 200) + (line.length > 200 ? "…[truncated]" : ""));

      await writer.write(new TextEncoder().encode(line));
      await Deno.remove(tmp);
      console.log(`✅ Appended ${obj.name}`);
    }

    page++;
    await Deno.writeTextFile(PAGE_FILE, String(page));
  }

  await writer.close();
}


async function runCopyWithUpsert() {
  const dbUrl = Deno.env.get("SUPABASE_DB_URL")!;
  console.log(`Splitting TSV into chunks of ${PAGE_SIZE} lines…`);

  // 1) Split TSV into chunk files
  const splitProc = Deno.run({
    cmd: ["split", "-l", String(PAGE_SIZE), TSV_FILE, "chunk_"],
    stdout: "inherit",
    stderr: "inherit",
  });
  const splitStatus = await splitProc.status();
  splitProc.close();
  if (!splitStatus.success) throw new Error("Failed to split TSV");

  // 2) Gather chunk filenames
  const chunks: string[] = [];
  for await (const e of Deno.readDir(".")) {
    if (e.name.startsWith("chunk_")) chunks.push(e.name);
  }
  chunks.sort();
  console.log(`Found ${chunks.length} chunk(s):`, chunks.join(", "));

  // 3) Process each chunk with pipe-into-psql-via--c
  for (const chunk of chunks) {
    console.log(`\n➡️  Loading chunk ${chunk}…`);
    const start = Date.now();

    const sql = `
CREATE TEMP TABLE tmp_backfill (
  submission_id bigint,
  platform      text,
  json_data     jsonb,
  created_at    timestamptz
);
COPY tmp_backfill FROM STDIN WITH (FORMAT csv, DELIMITER E'\\t', HEADER false);
INSERT INTO ${TABLE} (submission_id, platform, json_data, created_at)
  SELECT submission_id, 'TikTok', json_data, created_at
    FROM tmp_backfill
  ON CONFLICT (submission_id) DO NOTHING;
DROP TABLE tmp_backfill;
`;

    // Note: we wrap sql in double-quotes, and then pipe chunk into psql so COPY actually reads it.
    const shCmd = [
      "sh",
      "-c",
      `pv '${chunk}' \
        | grep -v '^$' \
        | psql -d '${dbUrl}' -v ON_ERROR_STOP=1 -c "${sql.replace(/\n/g, " ")}"`
    ];

    const proc = Deno.run({
      cmd:    shCmd,
      stdout: "inherit",
      stderr: "inherit",
      env:    { ...Deno.env.toObject(), PGSSLMODE: "require", PGOPTIONS: "--statement-timeout=0" },
    });
    const { success } = await proc.status();
    proc.close();

    const secs = ((Date.now() - start) / 1000).toFixed(1);
    if (!success) {
      console.error(`❌ Chunk ${chunk} failed after ${secs}s`);
      throw new Error(`Failed loading chunk ${chunk}`);
    }
    console.log(`✅ Chunk ${chunk} finished in ${secs}s`);
  }

  console.log("\n🎉 Bulk load with upsert complete!");
}

async function mergeUploads() {
  console.log("➡️  Starting mergeUploads()");

  // 1) Get only the IDs first
  const { data: idRows, error: idErr } = await supabase
    .from(SOURCE_TABLE)
    .select("submission_id")
    .not("submission_id", "is", null)
    .eq("platform", "TikTok");
  if (idErr) throw idErr;

  console.log(`  • Found ${idRows.length} submission_id(s)`);

  let successCount = 0;
  for (const { submission_id } of idRows) {
    console.log(`\n— processing ${submission_id}`);

    // 2a) Fetch that one big row
    console.time(`  fetch ${submission_id}`);
    const fetchRes = await supabase
      .from(SOURCE_TABLE)
      .select("submission_id, platform, json_data, created_at")
      .eq("submission_id", submission_id)
      .limit(1);
    console.timeEnd(`  fetch ${submission_id}`);

    if (fetchRes.error) {
      console.error(`  ✖️ fetch error:`, fetchRes.error);
      continue;
    }
    const row = fetchRes.data?.[0];
    if (!row) {
      console.warn(`  ⚠️ no data for ${submission_id}, skipping`);
      continue;
    }

    // 2b) Upsert it into test_bucket
    console.time(`  upsert ${submission_id}`);
    const { error: upsertErr } = await supabase
      .from("test_bucket")
      .upsert(row, {
        onConflict: ["submission_id"],
        ignoreDuplicates: true,
      });
    console.timeEnd(`  upsert ${submission_id}`);

    if (upsertErr) {
      console.error(`  ✖️ upsert error:`, upsertErr);
    } else {
      console.log(`  ✅ merged ${submission_id}`);
      successCount++;
    }
  }

  console.log(
    `\n  • Done! Successfully merged ${successCount}/${idRows.length}.`
  );
}

(async () => {
  try {
    await backfillToTsv();
    console.log("\n➡️  All rows written to TSV, now running bulk COPY with upsert…");
    await mergeUploads();
    await runCopyWithUpsert();
    console.log("🎉 All data imported successfully!");
  } catch (err) {
    console.error("❌ Backfill+Copy failed:", err);
    Deno.exit(1);
  }
})();
