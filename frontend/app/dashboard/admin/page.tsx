"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { api, type ApiResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type UserRow = { id: string; name: string; email: string; role: string; status: string };

export default function AdminDashboard() {
  const { data: users } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<UserRow[]>>("/admin/users", { params: { page: 1, limit: 25 } });
      return data.data ?? [];
    },
  });

  const { data: analytics } = useQuery({
    queryKey: ["admin-analytics"],
    queryFn: async () => {
      const { data } = await api.get<ApiResponse<unknown>>("/admin/analytics/summary");
      return data.data;
    },
  });

  return (
    <main className="mx-auto max-w-5xl space-y-8 px-4 py-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Admin console</h1>
          <p className="text-sm text-slate-400">Users, moderation queue, analytics</p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/">Home</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Platform analytics</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="max-h-64 overflow-auto rounded-md bg-slate-950 p-4 text-xs text-slate-200">
            {JSON.stringify(analytics, null, 2)}
          </pre>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(users ?? []).map((u) => (
            <div key={u.id} className="flex items-center justify-between rounded-lg border border-slate-800 p-3 text-sm">
              <div>
                <p className="font-medium">{u.name}</p>
                <p className="text-xs text-slate-400">
                  {u.email} · {u.role} · {u.status}
                </p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </main>
  );
}
