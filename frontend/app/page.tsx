import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-10 px-6 py-16">
      <div className="space-y-4">
        <p className="text-sm font-medium uppercase tracking-wide text-sky-400">Production-grade platform</p>
        <h1 className="text-4xl font-bold tracking-tight md:text-5xl">AI Job Matching for candidates and recruiters</h1>
        <p className="max-w-2xl text-lg text-slate-300">
          Upload resumes, parse skills with NLP, search jobs with Postgres full-text search, and match semantically with
          embeddings and BullMQ-backed async pipelines.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/auth/register">Create account</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/auth/login">Sign in</Link>
          </Button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {[
          { title: "JWT + RBAC", body: "Access and refresh rotation, Redis token blocklist, CSRF for mutations." },
          { title: "Search & AI", body: "Postgres full-text search with tsvector/GIN, FastAPI + sentence-transformers + FAISS-ready flows." },
          { title: "Async & Ops", body: "BullMQ workers, Docker Compose, Prometheus metrics, GitHub Actions CI." },
        ].map((c) => (
          <Card key={c.title}>
            <CardHeader>
              <CardTitle>{c.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-slate-300">{c.body}</CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
