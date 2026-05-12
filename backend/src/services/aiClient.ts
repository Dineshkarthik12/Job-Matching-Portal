import axios from "axios";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

const client = axios.create({
  baseURL: config.AI_SERVICE_URL,
  timeout: 120_000,
});

export async function parseResumePdf(url: string) {
  try {
    const { data } = await client.post("/parse-resume", { resume_url: url });
    return data;
  } catch (e) {
    logger.error("AI parse-resume failed", { e });
    throw e;
  }
}

export async function matchJobs(payload: {
  candidate_embedding: number[];
  job_descriptions: { id: string; text: string }[];
  top_k?: number;
}) {
  const { data } = await client.post("/match-jobs", payload);
  return data as { matches: { job_id: string; score: number }[] };
}

export async function rankCandidates(payload: {
  job_embedding: number[];
  candidates: { id: string; resume_text: string }[];
  top_k?: number;
}) {
  const { data } = await client.post("/rank-candidates", payload);
  return data as { ranked: { candidate_id: string; score: number }[] };
}
