export type Trust = {
  name: string;
  checkedAt: string;
  summary: string;
  operator: string;
  policy: string;
  experience: string;
  links: { label: string; url: string }[];
};

/** The link is only recorded with the profile; no request is made to LinkedIn. */
export function validLinkedinUrl(value: string): boolean {
  const url = value.trim();
  if (!url) return true;
  if (url.length > 500) return false;
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'linkedin.com' || parsed.hostname === 'www.linkedin.com') &&
      /^\/in\/[a-zA-Z0-9_%-]+\/?$/.test(parsed.pathname) &&
      !parsed.port &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

/** Match the server's minimum requirements before offering a search action. */
export function hasSearchKeyword(keywords: string[]): boolean {
  return keywords.some((keyword) => keyword.trim().length >= 2 && !/@|https?:|\d{7}/.test(keyword));
}

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

export async function fetchMe(): Promise<{ email: string; aiEnabled?: boolean } | null> {
  const r = await fetch('/api/me');
  if (r.status === 401) return null;
  if (!r.ok) throw new Error('서비스 연결 실패');
  return r.json();
}
