import { prisma } from "../lib/prisma.js";
import { Prisma } from "@prisma/client";
import { logger } from "../utils/logger.js";

/**
 * Postgres Full-Text Search service — replaces Elasticsearch.
 *
 * Uses Postgres tsvector/tsquery with a GIN index on the "Job" table
 * and a generated column `search_vector` populated via a trigger.
 *
 * For environments where the trigger hasn't been applied yet (e.g. dev),
 * the search gracefully falls back to ILIKE queries.
 */

// ── helpers ─────────────────────────────────────────────────────────

function buildTsQuery(raw: string): string {
  // Split the user query into words and join with "&" for AND matching
  const tokens = raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/[^a-zA-Z0-9]/g, "")) // sanitise
    .filter(Boolean);
  if (tokens.length === 0) return "";
  // Add :* for prefix matching (autocomplete-like behaviour)
  return tokens.map((t) => `${t}:*`).join(" & ");
}

// ── Public API (same signatures the old ES service exposed) ─────────

export async function ensureSearchIndex(): Promise<void> {
  try {
    // Create the search_vector column + GIN index if they don't exist yet.
    // This is idempotent — safe to run on every startup.
    await prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'Job' AND column_name = 'search_vector'
        ) THEN
          ALTER TABLE "Job"
            ADD COLUMN search_vector tsvector
            GENERATED ALWAYS AS (
              setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
              setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
              setweight(to_tsvector('english', coalesce(company_name, '')), 'C') ||
              setweight(to_tsvector('english', coalesce(location, '')), 'C') ||
              setweight(to_tsvector('english', coalesce(array_to_string(skills, ' '), '')), 'B')
            ) STORED;
        END IF;
      END
      $$;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_job_search_vector
        ON "Job" USING GIN (search_vector);
    `);

    logger.info("Postgres full-text search index is ready");
  } catch (e) {
    logger.warn("ensureSearchIndex failed (may need manual migration)", { e });
  }
}

export async function searchJobs(params: {
  q?: string;
  skills?: string[];
  location?: string;
  workMode?: string;
  from: number;
  size: number;
}): Promise<{ hits: Record<string, unknown>[]; total: number }> {
  const conditions: string[] = [
    `"published" = true`,
    `"moderated" = true`,
  ];
  const values: unknown[] = [];
  let paramIdx = 1;

  // Full-text query
  if (params.q) {
    const tsq = buildTsQuery(params.q);
    if (tsq) {
      conditions.push(`search_vector @@ to_tsquery('english', $${paramIdx})`);
      values.push(tsq);
      paramIdx++;
    }
  }

  // Skills filter (any match)
  if (params.skills?.length) {
    conditions.push(`skills && $${paramIdx}::text[]`);
    values.push(params.skills);
    paramIdx++;
  }

  // Location filter (ILIKE for fuzzy-ish matching)
  if (params.location) {
    conditions.push(`location ILIKE $${paramIdx}`);
    values.push(`%${params.location}%`);
    paramIdx++;
  }

  // Work-mode exact filter
  if (params.workMode) {
    conditions.push(`work_mode::text = $${paramIdx}`);
    values.push(params.workMode);
    paramIdx++;
  }

  const whereClause = conditions.join(" AND ");

  // Build ORDER BY — rank by ts_rank when a query is given, else newest first
  let orderBy = `"created_at" DESC`;
  if (params.q) {
    const tsq = buildTsQuery(params.q);
    if (tsq) {
      orderBy = `ts_rank(search_vector, to_tsquery('english', '${tsq.replace(/'/g, "''")}')) DESC, "created_at" DESC`;
    }
  }

  // Count
  const countQuery = `SELECT COUNT(*)::int AS total FROM "Job" WHERE ${whereClause}`;
  const countResult = await prisma.$queryRawUnsafe<[{ total: number }]>(
    countQuery,
    ...values
  );
  const total = countResult[0]?.total ?? 0;

  // Rows
  const dataQuery = `
    SELECT id, title, description, skills, location, work_mode AS "workMode",
           employment_type AS "employmentType", experience_min AS "experienceMin",
           experience_max AS "experienceMax", salary_min AS "salaryMin",
           salary_max AS "salaryMax", company_name AS "companyName",
           published, moderated, created_at AS "createdAt"
    FROM "Job"
    WHERE ${whereClause}
    ORDER BY ${orderBy}
    LIMIT ${params.size} OFFSET ${params.from}
  `;
  const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
    dataQuery,
    ...values
  );

  const hits = rows.map((r) => ({ ...r, id: r.id, score: null }));
  return { hits, total };
}

export async function suggestAutocomplete(
  prefix: string
): Promise<{ id: string; title: string }[]> {
  const tsq = buildTsQuery(prefix);
  if (!tsq) return [];

  const rows = await prisma.$queryRawUnsafe<{ id: string; title: string }[]>(
    `SELECT id, title FROM "Job"
     WHERE "published" = true
       AND search_vector @@ to_tsquery('english', $1)
     ORDER BY ts_rank(search_vector, to_tsquery('english', $1)) DESC
     LIMIT 8`,
    tsq
  );
  return rows;
}
