import type { Compensation, Job, Profile, SearchResult, SourceResult } from '../src/domain';
import type { Env } from './env';
import { matchesPreferences } from '../src/preferences';
import {
  matchesSearchKeyword,
  matchesTextTerm,
  missingTitleLanguages,
  scoreJob,
} from './relevance';
import { detectSafetySignals } from './safety';
import { isValidSourceUrl, parseAtsFeed, sources, type RawPosting } from './ats';
export { isValidSourceUrl, sources } from './ats';

type Source = (typeof sources)[number];
// Cache rows are optional; keep a conservative UTF-8 payload ceiling before D1 persistence.
const MAX_SOURCE_CACHE_BYTES = 1_000_000;

/** Keep ATS query identifiers; remove only parameters known to be acquisition tracking. */
export function canonicalJobUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const host = url.hostname.toLowerCase();
    if (
      !/^[a-z0-9.-]+$/.test(host) ||
      !host.includes('.') ||
      /(?:^|\.)(?:localhost|local|internal|test|example)$/.test(host) ||
      /^(?:\d{1,3}\.){3}\d{1,3}$/.test(host) ||
      /^\d+$/.test(host)
    )
      return null;
    // Provider lookalikes cannot be treated as genuine ATS hosts.
    if (
      /(?:lever\.co|greenhouse\.io|ashbyhq\.com)/.test(host) &&
      !/(?:^|\.)(?:lever\.co|greenhouse\.io|ashbyhq\.com)$/.test(host)
    )
      return null;
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_|^(?:gclid|dclid|fbclid|msclkid|mc_cid|mc_eid|gh_src|lever-source)$/i.test(key))
        url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.href;
  } catch {
    return null;
  }
}

/** A company may configure an external application URL in its official ATS feed. */
export function isRecognizedAtsJobUrl(value: string, type: Source['type']): boolean {
  const canonical = canonicalJobUrl(value);
  if (!canonical) return false;
  const url = new URL(canonical);
  const host = url.hostname;
  const path = url.pathname.split('/').filter(Boolean);
  return type === 'lever'
    ? host === 'jobs.lever.co' && path.length >= 2
    : type === 'greenhouse'
      ? (host === 'boards.greenhouse.io' || host === 'job-boards.greenhouse.io') &&
        (path.length >= 3 || (path.length >= 1 && url.searchParams.has('gh_jid')))
      : host === 'jobs.ashbyhq.com' && path.length >= 2;
}

export function isValidJobUrl(value: string, type: Source['type']): boolean {
  const canonical = canonicalJobUrl(value);
  if (!canonical) return false;
  const host = new URL(canonical).hostname;
  // An ATS's API or homepage must not masquerade as an individual job link.
  if (['api.lever.co', 'boards-api.greenhouse.io', 'api.ashbyhq.com'].includes(host)) return false;
  if (
    [
      'jobs.lever.co',
      'boards.greenhouse.io',
      'job-boards.greenhouse.io',
      'jobs.ashbyhq.com',
    ].includes(host)
  )
    return (
      isRecognizedAtsJobUrl(value, type) ||
      (['lever', 'greenhouse', 'ashby'] as const).some((provider) =>
        isRecognizedAtsJobUrl(value, provider),
      )
    );
  // Official ATS feeds sometimes point to the company's own application system.
  // Keep HTTPS links to other public domains, labelled as unverified external URLs.
  return true;
}

export function plain(s: unknown): string {
  return String(s ?? '')
    .replace(/<\/(?:p|div|li|h\d)>|<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .slice(0, 30000);
}
export function compensation(text: string): Compensation {
  const empty: Compensation = { min: null, max: null, currency: null, unit: null, note: '' };
  const line = text
    .split('\n')
    .find(
      (l) =>
        /(?:USD|KRW|EUR|GBP|AUD|CAD|US\$|A\$|C\$|\$|₩|€|£)\s*[\d,.]+/i.test(l) &&
        /pay|compensat|salary|wage|rate|earn|per |hour|day|week|month|year|annual|project|task|audio|보수|급여|시급|연봉|월급|주급|일급|건당|프로젝트/i.test(
          l,
        ),
    );
  if (!line) return empty;
  const currency = /USD|US\$/i.test(line)
    ? 'USD'
    : /KRW|₩/i.test(line)
      ? 'KRW'
      : /EUR|€/i.test(line)
        ? 'EUR'
        : /GBP|£/i.test(line)
          ? 'GBP'
          : /AUD|A\$/i.test(line)
            ? 'AUD'
            : /CAD|C\$/i.test(line)
              ? 'CAD'
              : null;
  const unit = /audio.{0,12}hour|per finished hour/i.test(line)
    ? 'audio_hour'
    : /audio.{0,12}minute/i.test(line)
      ? 'audio_minute'
      : /per (?:task|job)|paid by.{0,5}task|건당/i.test(line)
        ? 'task'
        : /hour|시급/i.test(line)
          ? 'hour'
          : /daily|per day|일급/i.test(line)
            ? 'day'
            : /week|주급/i.test(line)
              ? 'week'
              : /month|월급/i.test(line)
                ? 'month'
                : /year|annual|연봉/i.test(line)
                  ? 'year'
                  : /project|프로젝트/i.test(line)
                    ? 'project'
                    : null;
  if (
    /approximately|estimated|estimate|about|roughly|대략|추정/i.test(line) ||
    /stipend|reimbursement|equipment|allowance/i.test(line) ||
    (unit === 'task' && /hour/i.test(line))
  )
    return { ...empty, currency, unit, note: line.trim() };
  const match = line.match(
    /(?:USD|KRW|EUR|GBP|AUD|CAD|US\$|A\$|C\$|\$|₩|€|£)\s*([\d,]+(?:\.\d+)?)(?:\s*(?:-|–|—|to)\s*(?:USD|KRW|EUR|GBP|AUD|CAD|US\$|A\$|C\$|\$|₩|€|£)?\s*([\d,]+(?:\.\d+)?))?/i,
  );
  if (!match) return empty;
  const n = Number(match[1].replaceAll(',', '')),
    upper = match[2] ? Number(match[2].replaceAll(',', '')) : n;
  if (!Number.isFinite(n) || !Number.isFinite(upper) || n < 0 || upper < n)
    return { ...empty, currency, unit, note: line.trim() };
  return {
    min: /up to|maximum|최대/i.test(line) ? null : n,
    max: /starting|from|최소/i.test(line) && !match[2] ? null : upper,
    currency,
    unit,
    note: line.trim(),
  };
}
export function koreaStatus(
  location: string,
  description: string,
): Pick<Job, 'korea' | 'koreaEvidence'> {
  const explicit = description.match(
    /[^\n.]*(?:not (?:available|eligible).{0,35}(?:South Korea|Korea)|exclud(?:ing|es?).{0,25}(?:South Korea|Korea)|(?:US|United States)[ -]only\b|only (?:in|within|for) (?:the )?(?:US|United States)\b)[^\n.]*/i,
  );
  if (explicit) return { korea: 'excluded', koreaEvidence: explicit[0] };
  const south =
    /\bsouth korea\b|\brepublic of korea\b|\bkorea,?\s+republic of\b|\bseoul\b|대한민국|남한|서울|부산|인천|대구|대전|광주|울산|제주/i;
  const north =
    /\bnorth korea(?:n)?\b|\bdprk\b|\bpyongyang\b|\bdemocratic people'?s republic of korea\b|\bkorea,?\s+democratic people'?s republic of\b|북한|평양|조선민주주의인민공화국/i;
  if (south.test(location) || (!north.test(location) && /\bkorea\b|한국/i.test(location)))
    return {
      korea: 'confirmed',
      koreaEvidence: `공고 근무지: ${location}. 별도 근무 자격은 원문 확인.`,
    };
  if (north.test(location))
    return {
      korea: 'excluded',
      koreaEvidence: `공고 근무지: ${location}. 대한민국 근무지로 해석할 수 없습니다.`,
    };
  const sentence = description.match(
    /[^\n.]*(?:resident.{0,15}(?:South Korea|Korea)|based in (?:South Korea|Korea)|한국 거주|대한민국 거주)[^\n.]*/i,
  );
  if (sentence && !north.test(sentence[0]))
    return { korea: 'confirmed', koreaEvidence: sentence[0] };
  return {
    korea: 'unknown',
    koreaEvidence: '한국 거주자의 근무·계약 가능 여부를 명시적으로 확인하지 못했습니다.',
  };
}
export function normalize(raw: RawPosting, source: (typeof sources)[number], time: string): Job {
  const rawLocation = raw.location;
  const locationText = typeof rawLocation === 'string' ? rawLocation : (rawLocation?.name ?? '');
  const location =
    source.type === 'lever'
      ? (raw.categories?.allLocations ?? [raw.categories?.location]).filter(Boolean).join(' / ')
      : source.type === 'greenhouse'
        ? locationText
        : locationText;
  const description = plain(
    source.type === 'lever'
      ? [raw.descriptionPlain, ...(raw.lists ?? []).map((l) => l.text + '\n' + l.content)].join(
          '\n',
        )
      : source.type === 'greenhouse'
        ? raw.content
        : (raw.descriptionPlain ?? raw.descriptionHtml),
  );
  const title = String(raw.text ?? raw.title ?? '');
  const contractRaw =
    source.type === 'lever' ? raw.categories?.commitment : (raw.employmentType ?? '');
  const ct = contractRaw + ' ' + description;
  const contract = /freelance|independent contractor|프리랜서/i.test(ct)
    ? '프리랜서'
    : /contract|계약직/i.test(ct)
      ? '계약직'
      : /full.?time|정규직/i.test(ct)
        ? '정규직'
        : /part.?time|파트타임/i.test(ct)
          ? '파트타임'
          : '미기재';
  const workMode =
    /remote/i.test(raw.workplaceType ?? '') || raw.isRemote === true
      ? '원격'
      : /hybrid/i.test(raw.workplaceType ?? '')
        ? '하이브리드'
        : /onsite|on.?site/i.test(raw.workplaceType ?? '')
          ? '출근'
          : /remote|원격/i.test(location + ' ' + description)
            ? '원격 언급'
            : '미기재';
  let pay = compensation(description);
  if (raw.salaryRange) {
    const s = raw.salaryRange;
    const min = typeof s.min === 'number' && Number.isFinite(s.min) && s.min >= 0 ? s.min : null;
    const max = typeof s.max === 'number' && Number.isFinite(s.max) && s.max >= 0 ? s.max : null;
    if ((min !== null || max !== null) && (min === null || max === null || min <= max)) {
      const interval = s.interval ?? '';
      pay = {
        min,
        max,
        currency: /^[A-Z]{3}$/i.test(s.currency ?? '') ? s.currency!.toUpperCase() : null,
        unit: /audio.{0,10}hour|finished hour/i.test(interval)
          ? 'audio_hour'
          : /audio.{0,10}minute/i.test(interval)
            ? 'audio_minute'
            : /hour/i.test(interval)
              ? 'hour'
              : /day|daily/i.test(interval)
                ? 'day'
                : /week/i.test(interval)
                  ? 'week'
                  : /month/i.test(interval)
                    ? 'month'
                    : /year|annual/i.test(interval)
                      ? 'year'
                      : /project/i.test(interval)
                        ? 'project'
                        : /task|job/i.test(interval)
                          ? 'task'
                          : null,
        note: '공개 ATS 구조화 보수',
      };
    }
  }
  const url = String(raw.hostedUrl ?? raw.absolute_url ?? raw.jobUrl ?? '').trim();
  const rawDate = raw.publishedAt ?? raw.createdAt;
  const date =
    rawDate !== undefined &&
    rawDate !== null &&
    Number.isFinite(typeof rawDate === 'number' ? rawDate : Date.parse(rawDate)) &&
    Number.isFinite(new Date(rawDate).getTime())
      ? new Date(rawDate).toISOString()
      : null;
  const officialAtsLink = isRecognizedAtsJobUrl(url, source.type);
  return {
    id: `${source.id}:${raw.id}`,
    title,
    company: source.company,
    description,
    location: String(location ?? '미기재'),
    contract,
    compensation: pay,
    workMode,
    ...koreaStatus(location ?? '', description),
    hours:
      description
        .split('\n')
        .find((l) => /\d.{0,35}hours.{0,15}week|주\s*\d+\s*시간|\b(?:KST|UTC|CET)\b/i.test(l))
        ?.slice(0, 500) ?? null,
    source: source.name,
    sourceUrl: source.url,
    url,
    postedAt: date,
    fetchedAt: time,
    checkedAt: time,
    status: 'open',
    kind: /not an active job|talent (?:community|network|pool)|인재풀|general application/i.test(
      description + ' ' + title,
    )
      ? '인재풀'
      : /sign up to.{0,30}platform/i.test(description)
        ? '플랫폼 가입 모집'
        : '개별 공고',
    match: [],
    sourceStatus: officialAtsLink
      ? '공개 ATS 원문 조회 · 고용주 별도 교차검증 미완료'
      : '공개 ATS 피드 제공 외부 지원 링크 · 외부 도메인 추가 검증 필요',
    platform: source.id === 'welo' ? 'welo' : source.id === 'mercor' ? 'mercor' : null,
    safetySignals: detectSafetySignals(description),
  };
}
export async function fetchSource(
  source: (typeof sources)[number],
  env: Env,
): Promise<{ jobs: Job[]; report: SourceResult }> {
  if (!isValidSourceUrl(source)) throw new Error('공식 ATS 출처 URL 검증 실패');
  const row = await env.DB.prepare('SELECT data, updated_at FROM source_cache WHERE source=?')
    .bind(source.id)
    .first<{ data: string; updated_at: string }>();
  if (row && Date.now() - Date.parse(row.updated_at) < 900000) {
    try {
      const cached = JSON.parse(row.data) as unknown;
      if (
        Array.isArray(cached) &&
        cached.every((j) => j && typeof j === 'object' && typeof j.url === 'string')
      ) {
        return {
          jobs: (cached as Job[]).filter((j) => isValidJobUrl(j.url, source.type)),
          report: { source: source.name, count: 0, cached: true, checkedAt: row.updated_at },
        };
      }
    } catch {
      // A corrupt cache is not a successful source lookup; fetch the original feed.
    }
  }
  const r = await fetch(source.url, {
    signal: AbortSignal.timeout(25000),
    headers: { Accept: 'application/json' },
  });
  if (!r.ok) throw new Error(`출처 HTTP ${r.status}`);
  if (r.url && new URL(r.url).origin !== new URL(source.url).origin)
    throw new Error('ATS 출처가 다른 도메인으로 리디렉션됨');
  const text = await r.text();
  if (text.length > 20_000_000) throw new Error('공고 응답 크기 초과');
  const input = parseAtsFeed(JSON.parse(text) as unknown, source.type);
  const time = new Date().toISOString();
  const jobs = input
    .filter((r) => r.isListed !== false)
    .map((r) => normalize(r, source, time))
    .filter(
      (j) =>
        isValidJobUrl(j.url, source.type) && (j.korea === 'confirmed' || /원격/.test(j.workMode)),
    );
  try {
    const cacheData = JSON.stringify(jobs);
    if (new TextEncoder().encode(cacheData).byteLength <= MAX_SOURCE_CACHE_BYTES) {
      await env.DB.prepare(
        'INSERT INTO source_cache(source,data,updated_at) VALUES(?,?,?) ON CONFLICT(source) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at',
      )
        .bind(source.id, cacheData, time)
        .run();
    }
  } catch {
    // Cache persistence is best-effort; a successful fresh ATS fetch must still be usable.
  }
  return { jobs, report: { source: source.name, count: 0, cached: false, checkedAt: time } };
}
export async function search(profile: Profile, env: Env): Promise<SearchResult> {
  const keywords = [
    ...new Set(
      profile.keywords
        .map((k) => k.trim())
        .filter((k) => k.length >= 2 && !/@|https?:|\d{7}/.test(k))
        .slice(0, 20),
    ),
  ];
  if (!keywords.length) throw new Error('검색 키워드를 하나 이상 입력하세요.');
  const result = await Promise.allSettled(sources.map((s) => fetchSource(s, env)));
  const reports: SourceResult[] = [],
    jobs: Job[] = [],
    seenUrls = new Set<string>(),
    seenIds = new Set<string>();
  result.forEach((v, i) => {
    if (v.status === 'rejected') {
      reports.push({
        source: sources[i].name,
        count: 0,
        error: v.reason instanceof Error ? v.reason.message : '수집 실패',
        cached: false,
        checkedAt: null,
      });
      return;
    }
    let count = 0;
    for (const job of v.value.jobs) {
      if (!matchesPreferences(job, profile.preferences)) continue;
      // Every explicitly named title language must be present in the profile.
      // Matching Korean/한국어 aliases is handled by a single shared dictionary.
      if (missingTitleLanguages(job.title, profile.languages).length) continue;
      const scored = scoreJob(profile, job);
      const text = job.title + ' ' + job.description;
      if ((profile.negativeKeywords ?? []).some((k) => matchesTextTerm(text, k))) continue;
      const match = keywords.filter((k) => matchesSearchKeyword(text, k));
      if (!match.length || scored.matchScore < 25) continue;
      count++;
      const canonical = canonicalJobUrl(job.url);
      if (canonical && !seenUrls.has(canonical) && !seenIds.has(job.id)) {
        jobs.push({
          ...job,
          match,
          ...scored,
        });
        seenUrls.add(canonical);
        seenIds.add(job.id);
      }
    }
    reports.push({ ...v.value.report, count });
  });
  return {
    jobs: jobs
      .sort(
        (a, b) =>
          (b.matchScore ?? 0) - (a.matchScore ?? 0) ||
          (Date.parse(b.postedAt ?? '') || 0) - (Date.parse(a.postedAt ?? '') || 0),
      )
      .slice(0, 150),
    sources: reports,
    searchedAt: new Date().toISOString(),
    keywords,
    preferences: profile.preferences,
  };
}
