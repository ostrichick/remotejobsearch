import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPlatformProxy } from 'wrangler';
import { api } from '../server/worker';
import type { Env } from '../server/env';
import type { Profile } from '../src/domain';
test('real local D1/R2: identity separation, save persistence, deletion, auth and CSRF', async () => {
  const platform = await getPlatformProxy<Env>({ configPath: 'wrangler.jsonc' }),
    env = platform.env;
  const a = 'test-a-' + crypto.randomUUID(),
    b = 'test-b-' + crypto.randomUUID();
  async function call(
    uid: string,
    path: string,
    method = 'GET',
    body?: unknown,
    origin = 'https://test.local',
  ) {
    return api(
      new Request('https://test.local/api/' + path, {
        method,
        headers: {
          'oai-authenticated-user-id': uid,
          Origin: origin,
          'X-RoleScout': '1',
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      }),
      env,
    );
  }
  try {
    assert.equal((await api(new Request('https://test.local/api/profile'), env)).status, 401);
    const p: Profile = {
      skills: ['Python'],
      languages: ['English'],
      experience: ['2024 engineer'],
      education: [],
      keywords: ['Python'],
      mode: 'local',
    };
    assert.equal((await call(a, 'profile', 'PUT', p, 'https://evil.test')).status, 403);
    assert.equal((await call(a, 'profile', 'PUT', p)).status, 200);
    const profileGet = (await (await call(a, 'profile')).json()) as { skills: string[] };
    assert.deepEqual(profileGet.skills, ['Python']);
    assert.equal(await (await call(b, 'profile')).json(), null);
    assert.equal((await call(b, 'saved', 'POST', { id: 'foreign' })).status, 404);
    await env.DB.prepare('INSERT INTO searches(user_id,data,updated_at) VALUES(?,?,?)')
      .bind(
        a,
        JSON.stringify({ jobs: [{ id: 'owned', title: 'Owned test job' }] }),
        new Date().toISOString(),
      )
      .run();
    assert.equal((await call(a, 'saved', 'POST', { id: 'owned' })).status, 200);
    const aSaved = (await (await call(a, 'saved')).json()) as { id: string }[];
    assert.equal(aSaved.length, 1);
    const bSaved = (await (await call(b, 'saved')).json()) as unknown[];
    assert.equal(bSaved.length, 0);
    await env.FILES.put('tests/' + a, 'test file');
    await env.DB.prepare(
      'INSERT INTO resumes(user_id,object_key,filename,updated_at) VALUES(?,?,?,?)',
    )
      .bind(a, 'tests/' + a, 'test.txt', new Date().toISOString())
      .run();
    assert.equal(await (await call(b, 'resume')).json(), null);
    const today = new Date().toISOString().slice(0, 10);
    await env.DB.prepare('INSERT INTO limits(key,count) VALUES(?,?)')
      .bind(`${today}:${a}:analyze`, 2)
      .run();
    await env.DB.prepare('INSERT INTO limits(key,count) VALUES(?,?)')
      .bind(`${today}:${b}:search`, 3)
      .run();
    await call(b, 'data', 'DELETE');
    assert.ok(await env.FILES.get('tests/' + a));
    assert.equal(
      await env.DB.prepare('SELECT count FROM limits WHERE key=?')
        .bind(`${today}:${b}:search`)
        .first(),
      null,
    );
    assert.ok(
      await env.DB.prepare('SELECT count FROM limits WHERE key=?')
        .bind(`${today}:${a}:analyze`)
        .first(),
    );
    await call(a, 'data', 'DELETE');
    assert.equal(await env.FILES.get('tests/' + a), null);
    assert.equal(await (await call(a, 'profile')).json(), null);
    assert.equal(((await (await call(a, 'saved')).json()) as unknown[]).length, 0);
    assert.equal(
      await env.DB.prepare('SELECT count FROM limits WHERE key=?')
        .bind(`${today}:${a}:analyze`)
        .first(),
      null,
    );
  } finally {
    await call(a, 'data', 'DELETE');
    await call(b, 'data', 'DELETE');
    await platform.dispose();
  }
});
