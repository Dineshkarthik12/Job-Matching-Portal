from __future__ import annotations

import io
import re
from typing import Any

import httpx
import numpy as np
import pdfplumber
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

app = FastAPI(title="Job Matching AI", version="1.0.0")

_embedder = None


def get_embedder():
    global _embedder
    if _embedder is None:
        from sentence_transformers import SentenceTransformer

        _embedder = SentenceTransformer("all-MiniLM-L6-v2")
    return _embedder


def embed_texts(texts: list[str]) -> np.ndarray:
    model = get_embedder()
    return np.asarray(model.encode(texts, normalize_embeddings=True))


class ParseResumeRequest(BaseModel):
    resume_url: str


class MatchJobsRequest(BaseModel):
    candidate_embedding: list[float]
    job_descriptions: list[dict[str, str]]
    top_k: int = Field(default=10, ge=1, le=100)


class RankCandidatesRequest(BaseModel):
    job_embedding: list[float]
    candidates: list[dict[str, str]]
    top_k: int = Field(default=20, ge=1, le=200)


def extract_skills_from_text(text: str) -> list[str]:
    try:
        import spacy

        nlp = spacy.load("en_core_web_sm")
        doc = nlp(text[:50000])
        skills = {t.text for t in doc.ents if t.label_ in ("ORG", "PRODUCT", "GPE")}
        known = re.findall(
            r"\b(Python|TypeScript|JavaScript|React|Node\.?js|PostgreSQL|Redis|Docker|Kubernetes|AWS|GCP|FastAPI|Prisma|Next\.?js|Java|Go|Rust|SQL|Elasticsearch|Kafka|RabbitMQ|BullMQ)\b",
            text,
            flags=re.I,
        )
        skills.update(k.title() if k.lower() == k else k for k in known)
        return sorted({s.strip() for s in skills if len(s.strip()) > 1})[:40]
    except Exception:
        known = re.findall(
            r"\b(Python|TypeScript|JavaScript|React|Node\.?js|PostgreSQL|Redis|Docker|Kubernetes|AWS|GCP|FastAPI|Prisma|Next\.?js|Java|Go|Rust|SQL)\b",
            text,
            flags=re.I,
        )
        return sorted({k for k in known}, key=str.lower)[:40]


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/parse-resume")
async def parse_resume(body: ParseResumeRequest):
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            r = await client.get(body.resume_url)
            r.raise_for_status()
            data = r.content
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not fetch resume: {e}") from e

    text_parts: list[str] = []
    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            for page in pdf.pages[:30]:
                t = page.extract_text() or ""
                text_parts.append(t)
    except Exception:
        text_parts.append(data.decode("utf-8", errors="ignore")[:200000])

    full_text = "\n".join(text_parts)
    skills = extract_skills_from_text(full_text)
    embedding = embed_texts([full_text[:8000] or "empty"])[0].tolist()

    return {
        "skills": skills,
        "experience": {"raw_preview": full_text[:2000]},
        "education": {},
        "embedding": embedding,
    }


@app.post("/extract-skills")
async def extract_skills(payload: dict[str, Any]):
    text = str(payload.get("text", ""))
    return {"skills": extract_skills_from_text(text)}


@app.post("/match-jobs")
def match_jobs(body: MatchJobsRequest):
    if not body.job_descriptions:
        return {"matches": []}
    cand = np.asarray(body.candidate_embedding, dtype=np.float32)
    if cand.ndim != 1:
        raise HTTPException(status_code=400, detail="candidate_embedding must be 1d")
    texts = [j.get("text", "") for j in body.job_descriptions]
    job_emb = embed_texts(texts)
    scores = job_emb @ cand
    order = np.argsort(-scores)[: body.top_k]
    matches = [
        {"job_id": body.job_descriptions[i]["id"], "score": float(scores[i])}
        for i in order
    ]
    return {"matches": matches}


@app.post("/rank-candidates")
def rank_candidates(body: RankCandidatesRequest):
    if not body.candidates:
        return {"ranked": []}
    job = np.asarray(body.job_embedding, dtype=np.float32)
    if job.ndim != 1:
        raise HTTPException(status_code=400, detail="job_embedding must be 1d")
    texts = [c.get("resume_text", "") for c in body.candidates]
    cand_emb = embed_texts(texts)
    scores = cand_emb @ job
    order = np.argsort(-scores)[: body.top_k]
    ranked = [
        {"candidate_id": body.candidates[i]["id"], "score": float(scores[i])}
        for i in order
    ]
    return {"ranked": ranked}
