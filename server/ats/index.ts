/** The only feeds configured here are the three company boards verified for this project. */
export type AtsKind = 'lever' | 'greenhouse' | 'ashby';

export type AtsSource = {
  readonly id: string;
  readonly name: string;
  readonly company: string;
  readonly type: AtsKind;
  readonly url: string;
};

export const sources = [
  {
    id: 'welo',
    name: 'Welo Global · Lever',
    company: 'Welo Global',
    type: 'lever',
    url: 'https://api.lever.co/v0/postings/weloglobal?mode=json',
  },
  {
    id: 'coupang',
    name: 'Coupang · Greenhouse',
    company: 'Coupang',
    type: 'greenhouse',
    url: 'https://boards-api.greenhouse.io/v1/boards/coupang/jobs?content=true',
  },
  {
    id: 'mercor',
    name: 'Mercor · Ashby',
    company: 'Mercor',
    type: 'ashby',
    url: 'https://api.ashbyhq.com/posting-api/job-board/mercor?includeCompensation=true',
  },
] as const satisfies readonly AtsSource[];

export interface RawPosting {
  id?: string | number;
  text?: string;
  title?: string;
  descriptionPlain?: string;
  descriptionHtml?: string;
  content?: string;
  lists?: { text?: string; content?: string }[];
  categories?: { allLocations?: string[]; location?: string; commitment?: string };
  location?: { name?: string } | string;
  workplaceType?: string;
  isRemote?: boolean;
  employmentType?: string;
  salaryRange?: { min?: number; max?: number; currency?: string; interval?: string };
  hostedUrl?: string;
  absolute_url?: string;
  jobUrl?: string;
  publishedAt?: string;
  createdAt?: string | number;
  isListed?: boolean;
}

/** A new board must use the documented provider host/path and required query options. */
export function isValidSourceUrl(source: AtsSource): boolean {
  try {
    const url = new URL(source.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.hash)
      return false;
    const params = [...url.searchParams.keys()];
    return source.type === 'lever'
      ? url.hostname === 'api.lever.co' &&
          /^\/v0\/postings\/[a-z0-9_-]+$/i.test(url.pathname) &&
          params.length === 1 &&
          url.searchParams.get('mode') === 'json'
      : source.type === 'greenhouse'
        ? url.hostname === 'boards-api.greenhouse.io' &&
          /^\/v1\/boards\/[a-z0-9_-]+\/jobs$/i.test(url.pathname) &&
          params.length === 1 &&
          url.searchParams.get('content') === 'true'
        : url.hostname === 'api.ashbyhq.com' &&
          /^\/posting-api\/job-board\/[a-z0-9_-]+$/i.test(url.pathname) &&
          params.length === 1 &&
          url.searchParams.get('includeCompensation') === 'true';
  } catch {
    return false;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Decode the provider's envelope and discard malformed individual postings. */
export function parseAtsFeed(payload: unknown, type: AtsKind): RawPosting[] {
  const postings = type === 'lever' ? payload : isRecord(payload) ? payload.jobs : null;
  if (!Array.isArray(postings)) throw new Error(`${type} ATS 응답 형식 변경`);
  const valid = postings.filter((value: unknown): value is RawPosting => {
    if (!isRecord(value)) return false;
    if (!(
      (typeof value.id === 'string' && value.id.trim()) ||
      (typeof value.id === 'number' && Number.isFinite(value.id))
    ))
      return false;
    const title = type === 'lever' ? value.text : value.title;
    if (typeof title !== 'string' || !title.trim()) return false;
    const link =
      type === 'lever'
        ? (value.absolute_url ?? value.hostedUrl)
        : type === 'greenhouse'
          ? (value.absolute_url ?? value.jobUrl)
          : (value.jobUrl ?? value.hostedUrl);
    if (typeof link !== 'string' || !link.trim()) return false;
    for (const key of [
      'descriptionPlain',
      'descriptionHtml',
      'content',
      'workplaceType',
      'employmentType',
      'publishedAt',
    ]) {
      if (value[key] !== undefined && value[key] !== null && typeof value[key] !== 'string')
        return false;
    }
    // Lever supplies createdAt as epoch milliseconds; the other providers may use ISO strings.
    if (
      value.createdAt !== undefined &&
      value.createdAt !== null &&
      typeof value.createdAt !== 'string' &&
      !(typeof value.createdAt === 'number' && Number.isFinite(value.createdAt))
    )
      return false;
    if (value.isListed !== undefined && typeof value.isListed !== 'boolean') return false;
    if (value.isRemote !== undefined && typeof value.isRemote !== 'boolean') return false;
    if (
      value.location !== undefined &&
      value.location !== null &&
      typeof value.location !== 'string' &&
      (!isRecord(value.location) ||
        (value.location.name !== undefined && typeof value.location.name !== 'string'))
    )
      return false;
    if (
      value.categories !== undefined &&
      (!isRecord(value.categories) ||
        (value.categories.allLocations !== undefined &&
          (!Array.isArray(value.categories.allLocations) ||
            !value.categories.allLocations.every((entry: unknown) => typeof entry === 'string'))) ||
        (value.categories.location !== undefined &&
          typeof value.categories.location !== 'string') ||
        (value.categories.commitment !== undefined &&
          typeof value.categories.commitment !== 'string'))
    )
      return false;
    if (
      value.lists !== undefined &&
      (!Array.isArray(value.lists) ||
        !value.lists.every(
          (entry: unknown) =>
            isRecord(entry) &&
            (entry.text === undefined || typeof entry.text === 'string') &&
            (entry.content === undefined || typeof entry.content === 'string'),
        ))
    )
      return false;
    if (
      value.salaryRange !== undefined &&
      (!isRecord(value.salaryRange) ||
        ['min', 'max'].some(
          (key) =>
            value.salaryRange &&
            isRecord(value.salaryRange) &&
            value.salaryRange[key] !== undefined &&
            typeof value.salaryRange[key] !== 'number',
        ) ||
        ['currency', 'interval'].some(
          (key) =>
            value.salaryRange &&
            isRecord(value.salaryRange) &&
            value.salaryRange[key] !== undefined &&
            typeof value.salaryRange[key] !== 'string',
        ))
    )
      return false;
    return true;
  });
  if (postings.length && !valid.length) throw new Error(`${type} ATS 공고 항목 형식 변경`);
  return valid;
}
