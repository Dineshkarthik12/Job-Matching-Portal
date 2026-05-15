"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api, type ApiResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type JobHit = { id: string; title?: string; location?: string; skills?: string[] };

export default function CandidateDashboard() {
  const [q, setQ] = React.useState("");

  const { data: profile } = useQuery({
    queryKey: ["candidate-profile"],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<unknown>>("/candidates/profile");
      return data.data;
    },
  });

  const { data: recs } = useQuery({
    queryKey: ["recommendations"],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<{ score: number; job: JobHit }[]>>("/candidates/recommendations");
      return data.data ?? [];
    },
  });

  const { data: jobs } = useQuery({
    queryKey: ["job-search", q],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<JobHit[]>>("/search/jobs", { params: { page: 1, limit: 10, q } });
      return data;
    },
  });

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Candidate workspace</h1>
          <p className="text-sm text-slate-400">Profile, recommendations, and applications</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/">Home</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Profile snapshot</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-64 overflow-auto rounded-md bg-slate-950 p-4 text-xs text-slate-200">
            {JSON.stringify(profile, null, 2)}
          </pre>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Recommended jobs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {(recs ?? []).map((r) => (
            <div key={r.job?.id} className="flex items-center justify-between rounded-lg border border-slate-800 p-3">
              <div>
                <p className="font-medium">{r.job?.title}</p>
                <p className="text-xs text-slate-400">Score {(r.score * 100).toFixed(1)}%</p>
              </div>
              <Button size="sm" asChild>
                <Link href={`/jobs/${r.job?.id}`}>View</Link>
              </Button>
            </div>
          ))}
          {!recs?.length && <p className="text-sm text-slate-400">Upload a resume to unlock semantic matches.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Search Jobs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search jobs..." />
          </div>
          <div className="space-y-2">
            {(jobs?.data as JobHit[] | undefined)?.map((j) => (
              <div key={j.id} className="rounded-lg border border-slate-800 p-3">
                <p className="font-medium">{j.title}</p>
                <p className="text-xs text-slate-400">{j.location}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </main>
  );
}
