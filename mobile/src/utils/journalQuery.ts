export type JournalFilter = "all" | "month" | "review" | "cleanup";
export type JournalSort = "newest" | "longest" | "fastest";

export function buildRideListQuery({
  filter,
  sort,
  query,
  cursor,
  limit = 100
}: {
  filter: JournalFilter;
  sort: JournalSort;
  query?: string;
  cursor?: string | null;
  limit?: number;
}) {
  const params = [
    `period=${filter === "month" ? "month" : "all"}`,
    `limit=${Math.max(1, Math.round(limit))}`,
    `sort=${sort}`
  ];
  const normalizedQuery = query?.trim();
  if (normalizedQuery) params.push(`q=${encodeURIComponent(normalizedQuery)}`);
  if (filter === "review") params.push("reviewStatus=unreviewed");
  if (filter === "cleanup") params.push("reviewStatus=cleanup");
  if (cursor) params.push(`cursor=${encodeURIComponent(cursor)}`);
  return params.join("&");
}

export function mergeRidePages<T extends { id?: string | null }>(current: T[], incoming: T[]) {
  return [...new Map([...current, ...incoming].filter((ride) => ride?.id).map((ride) => [ride.id, ride])).values()];
}
