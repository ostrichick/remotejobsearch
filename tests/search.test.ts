import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalJobUrl,
  fetchSource,
  isRecognizedAtsJobUrl,
  isValidJobUrl,
  isValidSourceUrl,
  search,
  sources,
} from '../server/jobs';
import type { Profile } from '../src/domain';
import type { Env } from '../server/env';

const profile: Profile = {
  skills: ['annotation'],
  languages: ['한국어'],
  experience: ['AI data annotation'],
  education: [],
  keywords: ['Korean', 'annotation'],
  primaryRoleKeywords: ['annotation'],
  mode: 'local',
};

function leverPosting(id: string, title: string, url: string) {
  return {
    id,
    text: title,
    descriptionPlain: 'Korean annotation work. Data annotation experience required.',
    categories: { allLocations: ['Remote'], commitment: 'Contract' },
    workplaceType: 'Remote',
    absolute_url: url,
  };
}

function greenhousePosting(id: number, content = '<p>Localization work</p>') {
  return {
    id,
    title: `Localization Specialist ${id}`,
    absolute_url: `https://www.coupang.jobs/en/jobs/?gh_jid=${id}`,
    location: { name: 'Seoul, South Korea' },
    content,
  };
}

function envWithCache(): Env {
  const cache = new Map<string, { data: string; updated_at: string }>();
  return {
    DB: {
      prepare(statement: string) {
        return {
          bind(...args: unknown[]) {
            return {
              async first() {
                return cache.get(String(args[0])) ?? null;
              },
              async run() {
                assert.match(statement, /^INSERT INTO source_cache/);
                cache.set(String(args[0]), { data: String(args[1]), updated_at: String(args[2]) });
              },
            };
          },
        };
      },
    },
  } as unknown as Env;
}

test('tracking-only canonicalization preserves identifiers and rejects unsafe URL forms', () => {
  const a = 'https://jobs.lever.co/weloglobal/role?postingId=A&utm_source=mail&gh_src=ads';
  const b = 'https://jobs.lever.co/weloglobal/role?gh_src=other&postingId=A&utm_campaign=test';
  assert.equal(canonicalJobUrl(a), canonicalJobUrl(b));
  assert.notEqual(
    canonicalJobUrl(a),
    canonicalJobUrl('https://jobs.lever.co/weloglobal/role?postingId=B'),
  );
  assert.equal(
    canonicalJobUrl('https://jobs.lever.co/weloglobal/role?job=123#apply'),
    'https://jobs.lever.co/weloglobal/role?job=123#apply',
  );
  for (const url of [
    'javascript:alert(1)',
    'http://jobs.lever.co/weloglobal/a',
    'https://user:pass@jobs.lever.co/weloglobal/a',
    'https://jobs.lever.co.evil.com/weloglobal/a',
    'https://127.0.0.1/a',
    'https://localhost/a',
    'https://recruiting.example/a',
  ])
    assert.equal(canonicalJobUrl(url), null, url);
  assert.ok(isRecognizedAtsJobUrl('https://jobs.lever.co/weloglobal/role', 'lever'));
  assert.ok(
    isRecognizedAtsJobUrl('https://job-boards.greenhouse.io/coupang/jobs/123', 'greenhouse'),
  );
  assert.ok(!isRecognizedAtsJobUrl('https://jobs.lever.co/weloglobal/role', 'ashby'));
  assert.ok(!isRecognizedAtsJobUrl('https://jobs.lever.co/weloglobal', 'lever'));
  assert.equal(isValidJobUrl('https://api.lever.co/v0/postings/weloglobal', 'lever'), false);
  assert.equal(isValidJobUrl('https://jobs.lever.co/', 'lever'), false);
  assert.equal(isValidJobUrl('https://careers.vendor.com/apply?job=1', 'lever'), true);
  assert.equal(isValidJobUrl('https://jobs.ashbyhq.com/mercor/role', 'lever'), true);
});

test('ATS feed validation binds each provider to its documented HTTPS endpoint', async () => {
  assert.ok(sources.every(isValidSourceUrl));
  assert.equal(
    isValidSourceUrl({
      ...sources[0],
      url: 'https://api.lever.co.evil.com/v0/postings/weloglobal?mode=json',
    }),
    false,
  );
  assert.equal(
    isValidSourceUrl({
      ...sources[1],
      url: 'https://boards-api.greenhouse.io.evil.com/v1/boards/coupang/jobs?content=true',
    }),
    false,
  );
  await assert.rejects(
    fetchSource(
      { ...sources[0], url: 'http://api.lever.co/v0/postings/weloglobal?mode=json' },
      envWithCache(),
    ),
    /검증 실패/,
  );
});

test('cache write failure does not turn a successful fresh ATS fetch into source failure', async () => {
  const oldFetch = globalThis.fetch;
  const stale = {
    data: JSON.stringify([{ id: 'old', url: 'https://www.coupang.jobs/en/jobs/?gh_jid=1' }]),
    updated_at: '2000-01-01T00:00:00.000Z',
  };
  const stored = stale;
  let writes = 0;
  const env = {
    DB: {
      prepare(statement: string) {
        return {
          bind() {
            return {
              async first() {
                return statement.startsWith('SELECT') ? stored : null;
              },
              async run() {
                writes++;
                throw new Error('D1_ERROR: SQLITE_TOOBIG');
              },
            };
          },
        };
      },
    },
  } as unknown as Env;
  globalThis.fetch = async () => Response.json({ jobs: [greenhousePosting(8187545)] });
  try {
    const result = await fetchSource(sources[1], env);
    assert.deepEqual(
      result.jobs.map((job) => job.id),
      ['coupang:8187545'],
    );
    assert.equal(result.report.cached, false);
    assert.equal(result.report.checkedAt !== null, true);
    assert.equal(result.report.error, undefined);
    assert.equal(writes, 1);
    assert.equal(stored, stale);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('oversized fresh result skips cache persistence but still returns all jobs', async () => {
  const oldFetch = globalThis.fetch;
  let writes = 0;
  const env = {
    DB: {
      prepare(statement: string) {
        return {
          bind() {
            return {
              async first() {
                return null;
              },
              async run() {
                writes++;
                assert.match(statement, /^INSERT INTO source_cache/);
              },
            };
          },
        };
      },
    },
  } as unknown as Env;
  const jobs = [{ ...greenhousePosting(9000000), id: 'x'.repeat(1_050_000) }];
  globalThis.fetch = async () => Response.json({ jobs });
  try {
    const result = await fetchSource(sources[1], env);
    assert.equal(result.jobs.length, jobs.length);
    assert.equal(result.report.cached, false);
    assert.equal(result.report.checkedAt !== null, true);
    assert.equal(writes, 0);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('search applies Korean aliases, all required title languages, secure URLs and query-safe dedup', async () => {
  const oldFetch = globalThis.fetch;
  const sourceData = [
    leverPosting(
      'a',
      '한국어 AI Annotator',
      'https://jobs.lever.co/weloglobal/role?postingId=A&utm_source=feed',
    ),
    leverPosting(
      'a-copy',
      'Korean AI Annotator',
      'https://jobs.lever.co/weloglobal/role?utm_campaign=news&postingId=A',
    ),
    leverPosting('b', 'Korean AI Annotator', 'https://jobs.lever.co/weloglobal/role?postingId=B'),
    leverPosting('en', 'Korean English AI Annotator', 'https://jobs.lever.co/weloglobal/en'),
    leverPosting('bad', 'Korean AI Annotator', 'https://jobs.lever.co.evil.com/weloglobal/bad'),
  ];
  globalThis.fetch = async (input) =>
    Response.json(String(input).includes('api.lever.co') ? sourceData : { jobs: [] });
  try {
    const result = await search(profile, envWithCache());
    assert.deepEqual(
      result.jobs.map((j) => j.id),
      ['welo:a', 'welo:b'],
    );
    assert.equal(
      result.jobs[0].url.includes('utm_source=feed'),
      true,
      'original application URL remains intact',
    );
    assert.equal(result.jobs[0].sourceStatus.startsWith('공개 ATS 원문'), true);
    assert.equal(result.sources.length, 3);
    assert.equal(result.sources[0].count, 3, 'source count precedes cross-source dedup');
    assert.equal(
      result.sources.every((s) => !s.error),
      true,
    );
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('partial feed failure is explicit and does not discard successfully fetched postings', async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    if (String(input).includes('greenhouse')) throw new Error('greenhouse temporarily unavailable');
    return Response.json(
      String(input).includes('lever.co')
        ? [leverPosting('a', '한국어 AI Annotator', 'https://jobs.lever.co/weloglobal/a')]
        : { jobs: [] },
    );
  };
  try {
    const result = await search(profile, envWithCache());
    assert.deepEqual(
      result.jobs.map((j) => j.id),
      ['welo:a'],
    );
    assert.equal(result.sources.filter((s) => !!s.error).length, 1);
    assert.match(result.sources[1].error ?? '', /unavailable/);
    assert.equal(result.sources[1].checkedAt, null);
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('if every source fails, result reports every failure for API to retain the previous snapshot', async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('feed outage');
  };
  try {
    const result = await search(profile, envWithCache());
    assert.deepEqual(result.jobs, []);
    assert.equal(result.sources.length, 3);
    assert.equal(
      result.sources.every((s) => !!s.error),
      true,
    );
  } finally {
    globalThis.fetch = oldFetch;
  }
});

test('external HTTPS link returned by official feed retains URL with verification caveat', async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (input) =>
    Response.json(
      String(input).includes('lever.co')
        ? [leverPosting('custom', 'Korean AI Annotator', 'https://careers.vendor.com/jobs?id=345')]
        : { jobs: [] },
    );
  try {
    const result = await search(profile, envWithCache());
    assert.equal(result.jobs.length, 1);
    assert.equal(result.jobs[0].url, 'https://careers.vendor.com/jobs?id=345');
    assert.match(result.jobs[0].sourceStatus, /외부 도메인 추가 검증 필요/);
  } finally {
    globalThis.fetch = oldFetch;
  }
});
