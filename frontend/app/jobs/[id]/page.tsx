"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, type ApiResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Job = {
  id: string;
  title: string;
  description: string;
  skills: string[];
  location?: string | null;
};

export default function JobDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data: job } = useQuery({
    queryKey: ["job", id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<Job>>(`/jobs/${id}`);
      return data.data;
    },
  });

  async function apply() {
    await api.post(`/candidates/jobs/${id}/apply`);
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-10">
      <Button variant="ghost" asChild>
        <Link href="/dashboard/candidate">Back</Link>
      </Button>
      <Card>
        <CardHeader>
          <CardTitle>{job?.title ?? "Loading..."}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-400">{job?.location}</p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{job?.description}</p>
          <div className="flex flex-wrap gap-2">
            {job?.skills?.map((s) => (
              <span key={s} className="rounded-full bg-slate-800 px-3 py-1 text-xs">
                {s}
              </span>
            ))}
          </div>
          <Button type="button" onClick={() => void apply()}>
            Apply
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
