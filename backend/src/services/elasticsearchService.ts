import { Client } from "@elastic/elasticsearch";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

const JOBS_INDEX = "jobs";

export const esClient = new Client({
  node: config.ELASTICSEARCH_URL,
  requestTimeout: 30000,
});

export async function ensureJobsIndex() {
  try {
    const exists = await esClient.indices.exists({ index: JOBS_INDEX });
    if (!exists) {
      await esClient.indices.create({
        index: JOBS_INDEX,
        mappings: {
          properties: {
            id: { type: "keyword" },
            title: { type: "text", analyzer: "standard" },
            description: { type: "text" },
            skills: { type: "keyword" },
            location: { type: "text", fields: { raw: { type: "keyword" } } },
            workMode: { type: "keyword" },
            employmentType: { type: "keyword" },
            experienceMin: { type: "integer" },
            experienceMax: { type: "integer" },
            salaryMin: { type: "integer" },
            salaryMax: { type: "integer" },
            companyName: { type: "text" },
            published: { type: "boolean" },
            moderated: { type: "boolean" },
            createdAt: { type: "date" },
          },
        },
      });
      logger.info("Created Elasticsearch jobs index");
    }
  } catch (e) {
    logger.warn("Elasticsearch ensure index failed (service may be down)", { e });
  }
}

export async function indexJobDocument(job: {
  id: string;
  title: string;
  description: string;
  skills: string[];
  location: string | null;
  workMode: string;
  employmentType: string;
  experienceMin: number | null;
  experienceMax: number | null;
  salaryMin: number | null;
  salaryMax: number | null;
  companyName: string | null;
  published: boolean;
  moderated: boolean;
  createdAt: Date;
}) {
  await esClient.index({
    index: JOBS_INDEX,
    id: job.id,
    document: {
      ...job,
      createdAt: job.createdAt.toISOString(),
    },
    refresh: false,
  });
}

export async function deleteJobDocument(id: string) {
  try {
    await esClient.delete({ index: JOBS_INDEX, id, refresh: false });
  } catch {
    /* ignore missing */
  }
}

export async function searchJobs(params: {
  q?: string;
  skills?: string[];
  location?: string;
  workMode?: string;
  from: number;
  size: number;
}) {
  const must: object[] = [{ term: { published: true } }, { term: { moderated: true } }];
  if (params.q) {
    must.push({
      multi_match: {
        query: params.q,
        fields: ["title^3", "description", "skills", "companyName"],
        fuzziness: "AUTO",
      },
    });
  }
  if (params.skills?.length) {
    must.push({
      bool: {
        should: params.skills.map((s) => ({ term: { skills: s } })),
        minimum_should_match: 1,
      },
    });
  }
  if (params.location) {
    must.push({
      match: { location: { query: params.location, fuzziness: "AUTO" } },
    });
  }
  if (params.workMode) {
    must.push({ term: { workMode: params.workMode } });
  }

  const body = await esClient.search({
    index: JOBS_INDEX,
    from: params.from,
    size: params.size,
    query: { bool: { must } },
    sort: [{ _score: { order: "desc" } }, { createdAt: { order: "desc" } }],
  });

  const hits = body.hits.hits.map((h) => ({
    id: h._id,
    score: h._score,
    ...(h._source as object),
  }));
  const total =
    typeof body.hits.total === "number" ? body.hits.total : body.hits.total?.value ?? 0;
  return { hits, total };
}

export async function suggestAutocomplete(prefix: string) {
  const body = await esClient.search({
    index: JOBS_INDEX,
    size: 8,
    query: {
      bool: {
        must: [
          { term: { published: true } },
          {
            match_phrase_prefix: {
              title: { query: prefix, max_expansions: 10 },
            },
          },
        ],
      },
    },
    _source: ["title", "id"],
  });
  return body.hits.hits.map((h) => ({
    id: h._id,
    title: (h._source as { title?: string })?.title,
  }));
}
