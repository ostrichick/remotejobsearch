export type Trust = {
  name: string;
  checkedAt: string;
  summary: string;
  operator: string;
  policy: string;
  experience: string;
  links: { label: string; url: string }[];
};

export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const r = await fetch('/api/' + path, {
    method,
    headers: {
      'X-RoleScout': '1',
      ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  });
  const data = (await r.json()) as T & { error?: string };
  if (!r.ok) throw new Error(data.error ?? '요청 실패');
  return data;
}

export async function fetchMe(): Promise<{ email: string } | null> {
  const r = await fetch('/api/me');
  if (r.status === 401) return null;
  if (!r.ok) throw new Error('서비스 연결 실패');
  return r.json();
}
