import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPlatformProxy } from 'wrangler';
import { api } from '../server/worker';
import { sources } from '../server/jobs';
import { scoreJob } from '../server/relevance';
import { validateProfile } from '../server/profile';
import type { Env } from '../server/env';
import type { Job, Profile, SearchResult } from '../src/domain';

const origin = 'https://test.local';
const text =
  '2024 Korean language teaching and Python annotation. English and Korean communication.';
const profile: Profile = {
  skills: ['Python'],
  languages: ['Korean'],
  experience: ['2024 data annotation'],
  education: [],
  keywords: ['Python'],
  mode: 'local',
};

function request(uid: string, path: string, method = 'GET', body?: BodyInit, extra?: HeadersInit) {
  return new Request(`${origin}/api/${path}`, {
    method,
    headers: { 'oai-authenticated-user-id': uid, Origin: origin, 'X-RoleScout': '1', ...extra },
    body,
  });
}

const form = (consent = true, file = false) => {
  const value = new FormData();
  value.set('text', text);
  if (consent) value.set('analysisConsent', 'true');
  if (file)
    value.set(
      'file',
      new File(['%PDF-1.4\nFake test content'], 'resume.pdf', { type: 'application/pdf' }),
    );
  return value;
};

test('consent, validation, bounded bodies and quotas are enforced before storage', async () => {
  const platform = await getPlatformProxy<Env>({ configPath: 'wrangler.jsonc' });
  const env = { ...platform.env, ANALYZE_DAILY_LIMIT: '1' } as Env;
  const uid = `regression-${crypto.randomUUID()}`;
  const count = () =>
    env.DB.prepare('SELECT count FROM limits WHERE key=?')
      .bind(`${new Date().toISOString().slice(0, 10)}:${uid}:analyze`)
      .first<{ count: number }>();
  try {
    assert.equal((await api(request(uid, 'analyze', 'POST', form(false)), env)).status, 422);
    assert.equal(await count(), null);
    const invalid = form();
    invalid.set('file', new File(['invalid'], 'resume.pdf'));
    assert.equal((await api(request(uid, 'analyze', 'POST', invalid), env)).status, 400);
    assert.equal(await count(), null);

    const large = request(uid, 'profile', 'PUT', JSON.stringify({ text: 'X'.repeat(300) }), {
      'Content-Type': 'application/json',
      'Content-Length': '1',
    });
    assert.equal((await api(large, { ...env, MAX_BODY_BYTES: '100' })).status, 413);
    assert.equal(await count(), null);

    assert.equal((await api(request(uid, 'analyze', 'POST', form()), env)).status, 200);
    assert.equal((await count())?.count, 1);
    assert.equal((await api(request(uid, 'analyze', 'POST', form()), env)).status, 429);
    assert.equal((await count())?.count, 1);
  } finally {
    await api(request(uid, 'data', 'DELETE'), env);
    await platform.dispose();
  }
});

test('LinkedIn URL is canonicalized, rejected for other hosts, and retained after re-analysis', async () => {
  const platform = await getPlatformProxy<Env>({ configPath: 'wrangler.jsonc' });
  const env = platform.env;
  const uid = `linkedin-${crypto.randomUUID()}`;
  try {
    for (const linkedinUrl of [
      'https://linkedin.com.evil.test/in/person',
      'https://www.linkedin.com/jobs/person',
      'http://linkedin.com/in/person',
    ]) {
      const response = await api(
        request(uid, 'profile', 'PUT', JSON.stringify({ ...profile, linkedinUrl }), {
          'Content-Type': 'application/json',
        }),
        env,
      );
      assert.equal(response.status, 400);
    }
    const valid = {
      ...profile,
      linkedinUrl: 'https://linkedin.com/in/person/?trk=tracking',
      preferences: {
        text: '',
        remote: true,
        korea: false,
        location: '',
        contract: '',
        maxWeeklyHours: '',
      },
    };
    const put = await api(
      request(uid, 'profile', 'PUT', JSON.stringify(valid), { 'Content-Type': 'application/json' }),
      env,
    );
    assert.equal(put.status, 200);
    assert.equal(
      ((await put.json()) as Profile).linkedinUrl,
      'https://www.linkedin.com/in/person/',
    );
    const analyze = await api(request(uid, 'analyze', 'POST', form()), env);
    assert.equal(analyze.status, 200);
    const restored = (await analyze.json()) as Profile;
    assert.equal(restored.linkedinUrl, 'https://www.linkedin.com/in/person/');
    assert.equal(restored.preferences?.remote, true);
    assert.equal(
      await env.DB.prepare('SELECT object_key FROM resumes WHERE user_id=?').bind(uid).first(),
      null,
    );
  } finally {
    await api(request(uid, 'data', 'DELETE'), env);
    await platform.dispose();
  }
});

test('a failed resume metadata transaction deletes only the new R2 object', async () => {
  const platform = await getPlatformProxy<Env>({ configPath: 'wrangler.jsonc' });
  const env = platform.env;
  const uid = `upload-${crypto.randomUUID()}`;
  let newKey = '';
  try {
    assert.equal((await api(request(uid, 'analyze', 'POST', form(true, true)), env)).status, 200);
    const existing = await env.DB.prepare('SELECT object_key FROM resumes WHERE user_id=?')
      .bind(uid)
      .first<{ object_key: string }>();
    assert.ok(existing?.object_key);
    assert.ok(await env.FILES.get(existing.object_key));
    const failEnv: Env = {
      ...env,
      DB: {
        prepare: env.DB.prepare.bind(env.DB),
        batch: async () => {
          throw new Error('simulated metadata failure');
        },
      } as unknown as D1Database,
      FILES: {
        put: async (key: string, bytes: Uint8Array, options?: R2PutOptions) => {
          newKey = key;
          return env.FILES.put(key, bytes, options);
        },
        delete: env.FILES.delete.bind(env.FILES),
      } as unknown as R2Bucket,
    };
    assert.equal(
      (await api(request(uid, 'analyze', 'POST', form(true, true)), failEnv)).status,
      400,
    );
    assert.ok(newKey);
    assert.notEqual(newKey, existing.object_key);
    assert.equal(await env.FILES.get(newKey), null);
    assert.ok(await env.FILES.get(existing.object_key));
    const after = await env.DB.prepare('SELECT object_key FROM resumes WHERE user_id=?')
      .bind(uid)
      .first<{ object_key: string }>();
    assert.equal(after?.object_key, existing.object_key);
  } finally {
    await api(request(uid, 'data', 'DELETE'), env);
    if (newKey) await env.FILES.delete(newKey);
    await platform.dispose();
  }
});

test('search fingerprint invalidates edits, detects new jobs only between complete searches, preserves last complete snapshot', async () => {
  const platform = await getPlatformProxy<Env>({ configPath: 'wrangler.jsonc' });
  const env = platform.env;
  const uid = `search-${crypto.randomUUID()}`;
  const original = await Promise.all(
    sources.map((source) =>
      env.DB.prepare('SELECT data,updated_at FROM source_cache WHERE source=?')
        .bind(source.id)
        .first<{ data: string; updated_at: string }>(),
    ),
  );
  const makeJob = (index: number, id: string): Job => ({
    id: `${sources[index].id}:${id}`,
    title: 'Python Data Annotator',
    company: sources[index].company,
    description: 'Python annotation role. Korean language.',
    location: 'South Korea',
    contract: '계약직',
    compensation: { min: null, max: null, currency: null, unit: null, note: '' },
    workMode: '원격',
    korea: 'confirmed',
    koreaEvidence: 'South Korea',
    hours: null,
    source: sources[index].name,
    sourceUrl: sources[index].url,
    url:
      index === 0
        ? `https://jobs.lever.co/weloglobal/${id}`
        : index === 1
          ? `https://boards.greenhouse.io/coupang/jobs/${id}`
          : `https://jobs.ashbyhq.com/mercor/${id}`,
    postedAt: null,
    fetchedAt: new Date().toISOString(),
    checkedAt: new Date().toISOString(),
    status: 'open',
    kind: '개별 공고',
    match: [],
    sourceStatus: '공개 ATS',
    platform: null,
  });
  const cache = async (index: number, jobs: Job[], fresh = true) =>
    env.DB.prepare(
      'INSERT INTO source_cache(source,data,updated_at) VALUES(?,?,?) ON CONFLICT(source) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at',
    )
      .bind(
        sources[index].id,
        JSON.stringify(jobs),
        new Date(Date.now() - (fresh ? 0 : 900_001)).toISOString(),
      )
      .run();
  const runSearch = () =>
    api(request(uid, 'search', 'POST', '{}', { 'Content-Type': 'application/json' }), env);
  const ageSearch = async () => {
    const row = await env.DB.prepare('SELECT data FROM searches WHERE user_id=?')
      .bind(uid)
      .first<{ data: string }>();
    const result = JSON.parse(row!.data) as SearchResult;
    result.searchedAt = new Date(Date.now() - 120_000).toISOString();
    await env.DB.prepare('UPDATE searches SET data=? WHERE user_id=?')
      .bind(JSON.stringify(result), uid)
      .run();
  };
  const realFetch = globalThis.fetch;
  try {
    assert.ok(
      scoreJob(validateProfile(profile), makeJob(0, 'first')).matchScore >= 25,
      JSON.stringify(scoreJob(validateProfile(profile), makeJob(0, 'first'))),
    );
    for (let index = 0; index < sources.length; index++)
      await cache(index, [makeJob(index, 'first')]);
    assert.equal(
      (
        await api(
          request(uid, 'profile', 'PUT', JSON.stringify(profile), {
            'Content-Type': 'application/json',
          }),
          env,
        )
      ).status,
      200,
    );
    const initial = (await (await runSearch()).json()) as SearchResult;
    assert.equal(
      initial.sources.every((source) => !source.error),
      true,
    );
    assert.deepEqual(initial.newJobIds, []);
    await ageSearch();
    await cache(0, [makeJob(0, 'first'), makeJob(0, 'new')]);
    const second = (await (await runSearch()).json()) as SearchResult;
    assert.deepEqual(
      second.newJobIds,
      ['welo:new'],
      JSON.stringify({
        initial: initial.jobs.map((job) => job.id),
        second: second.jobs.map((job) => job.id),
        priorTimestamp: second.previousSearchedAt,
        sourceReports: second.sources,
      }),
    );
    assert.ok(second.previousSearchedAt);
    const reused = (await (await runSearch()).json()) as SearchResult;
    assert.deepEqual(reused.newJobIds, ['welo:new']);

    await ageSearch();
    await cache(0, [makeJob(0, 'first'), makeJob(0, 'new')], false);
    globalThis.fetch = (async () => {
      throw new Error('simulated ATS outage');
    }) as typeof fetch;
    const partial = await runSearch();
    assert.equal(partial.status, 502);
    assert.match(JSON.stringify(await partial.json()), /일부 출처/);
    assert.equal(
      ((await (await api(request(uid, 'search'), env)).json()) as SearchResult).jobs.length,
      4,
    );
    globalThis.fetch = realFetch;
    await cache(0, [makeJob(0, 'first'), makeJob(0, 'new')]);

    assert.equal(
      (
        await api(
          request(
            uid,
            'profile',
            'PUT',
            JSON.stringify({ ...profile, skills: ['Python', 'SQL'] }),
            { 'Content-Type': 'application/json' },
          ),
          env,
        )
      ).status,
      200,
    );
    assert.equal(await (await api(request(uid, 'search'), env)).json(), null);
    const revised = (await (await runSearch()).json()) as SearchResult;
    assert.deepEqual(revised.newJobIds, []);
    assert.equal(revised.previousSearchedAt, null);
  } finally {
    globalThis.fetch = realFetch;
    await api(request(uid, 'data', 'DELETE'), env);
    for (let index = 0; index < sources.length; index++) {
      const row = original[index];
      if (row)
        await env.DB.prepare(
          'INSERT INTO source_cache(source,data,updated_at) VALUES(?,?,?) ON CONFLICT(source) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at',
        )
          .bind(sources[index].id, row.data, row.updated_at)
          .run();
      else
        await env.DB.prepare('DELETE FROM source_cache WHERE source=?')
          .bind(sources[index].id)
          .run();
    }
    await platform.dispose();
  }
});
