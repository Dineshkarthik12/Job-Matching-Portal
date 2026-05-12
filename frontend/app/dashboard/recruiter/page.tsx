"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { api, type ApiResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Job = { id: string; title: string; moderated: boolean; published: boolean };

export default function RecruiterDashboard() {
  const qc = useQueryClient();
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [skills, setSkills] = React.useState("TypeScript, PostgreSQL");

  const { data: jobs } = useQuery({
    queryKey: ["my-jobs"],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<Job[]>>("/jobs/mine", { params: { page: 1, limit: 20 } });
      return data.data ?? [];
    },
  });

  const createJob = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<ApiResponse<Job>>("/jobs", {
        title,
        description,
        skills: skills.split(",").map((s) => s.trim()).filter(Boolean),
      });
      return data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["my-jobs"] });
      setTitle("");
      setDescription("");
    },
  });

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Recruiter dashboard</h1>
          <p className="text-sm text-slate-400">Create listings, review applicants, and run AI ranking</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/">Home</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>New job</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea
            className="min-h-[120px] w-full rounded-md border border-slate-800 bg-slate-950 px-3 py-2 text-sm"
            placeholder="Description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <Input placeholder="Skills (comma separated)" value={skills} onChange={(e) => setSkills(e.target.value)} />
          <Button type="button" disabled={createJob.isPending} onClick={() => createJob.mutate()}>
            {createJob.isPending ? "Saving..." : "Publish draft (awaits moderation)"}
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Your jobs</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(jobs ?? []).map((j) => (
            <div key={j.id} className="flex items-center justify-between rounded-lg border border-slate-800 p-3">
              <div>
                <p className="font-medium">{j.title}</p>
                <p className="text-xs text-slate-400">
                  Moderated: {String(j.moderated)} · Published: {String(j.published)}
                </p>
              </div>
              <Button size="sm" variant="outline" asChild>
                <Link href={`/jobs/${j.id}`}>Open</Link>
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
