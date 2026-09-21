import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { api } from '../server/worker';
import {
  evaluationCsv,
  evaluationReport,
  validateEvaluation,
  type Evaluation,
} from '../server/evaluation';
import type { Env } from '../server/env';
import type { Job, SearchResult } from '../src/domain';

const origin = 'https://test.local';

/** An isolated in-memory SQLite D1 adapter; never touches .wrangler or an external database. */
function localDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  for (const name of ['0000_complete_miracleman', '0001_jittery_reptil', '0002_boring_ben_grimm']) {
    const sql = readFileSync(new URL(`../drizzle/${name}.sql`, import.meta.url), 'utf8');
    sqlite.exec(sql.replaceAll('--> statement-breakpoint', '\n'));
  }
  const prepared = (sql: string) => {
    const statement = sqlite.prepare(sql);
    return {
      bind(...values: unknown[]) {
        // SQLite-native prepared statements use the same ? parameter order as D1.
        const args = values as (string | number | null)[];
        return {
          async first<T>() {
            return (statement.get(...args) ?? null) as T | null;
          },
          async all<T>() {
            return { results: statement.all(...args) as T[] };
          },
          async run() {
            return statement.run(...args);
          },
        };
      },
    };
  };
  const db = {
    prepare: prepared,
    async batch(statements: { run: () => Promise<unknown> }[]) {
      for (const statement of statements) await statement.run();
      return [];
    },
  } as unknown as D1Database;
  const env = {
    DB: db,
    FILES: { delete: async () => undefined },
  } as unknown as Env;
  return { sqlite, db, env };
}

function request(
  uid: string | null,
  path: string,
  method = 'GET',
  payload?: unknown,
  wrongOrigin = false,
) {
  const headers: Record<string, string> = {
    Origin: wrongOrigin ? 'https://other.test' : origin,
    'X-RoleScout': '1',
    'Content-Type': 'application/json',
  };
  if (uid) headers['oai-authenticated-user-id'] = uid;
  return new Request(`${origin}/api/${path}`, {
    method,
    headers,
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}

function job(
  id: string,
  score: number | undefined,
  korea: Job['korea'],
  title = 'Korean reviewer',
): Job {
  return {
    id,
    title,
    company: 'Example',
    source: 'Example · Lever',
    sourceUrl: 'https://api.lever.co/v0/postings/example?mode=json',
    url: `https://jobs.lever.co/example/${id}`,
    description: 'PRIVATE_JOB_DESCRIPTION_SHOULD_NOT_BE_STORED',
    location: 'Remote',
    contract: '계약직',
    workMode: '원격',
    korea,
    koreaEvidence: 'PRIVATE_EVIDENCE_SHOULD_NOT_BE_STORED',
    hours: null,
    compensation: {
      min: 10,
      max: 20,
      currency: 'USD',
      unit: 'hour',
      note: 'PRIVATE_NOTE_SHOULD_NOT_BE_STORED',
    },
    match: ['Korean'],
    matchScore: score,
    scoreVersion: 'rules-v2',
    matchedEvidence: ['언어 표현: Korean', '기술 표현: QA'],
    missingEvidence: [],
    status: 'open',
    kind: '개별 공고',
    sourceStatus: 'ATS',
    platform: null,
    fetchedAt: '2026-09-21T00:00:00.000Z',
    checkedAt: '2026-09-21T00:00:00.000Z',
    postedAt: null,
  };
}

function addSearch(sqlite: DatabaseSync, uid: string, jobs: Job[]) {
  const result: SearchResult = {
    jobs,
    sources: [],
    searchedAt: '2026-09-21T00:00:00.000Z',
    keywords: ['Korean'],
  };
  sqlite
    .prepare(
      `INSERT INTO searches(user_id,data,updated_at) VALUES (?,?,?)
    ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at`,
    )
    .run(uid, JSON.stringify(result), result.searchedAt);
}

const evaluation = (jobId: string, changes: Record<string, unknown> = {}) => ({
  jobId,
  relevance: 'no',
  korea: 'yes',
  salary: 'wrong',
  language: 'wrong',
  notes: 'my private review',
  ...changes,
});

test('evaluation API enforces owner-only CRUD, stored job membership, snapshot version and deletion', async () => {
  const { sqlite, env } = localDatabase();
  try {
    const a = 'account-a',
      b = 'account-b';
    addSearch(sqlite, a, [job('a-job', 80, 'confirmed', '=SUM(1,1)'), job('low', 20, 'excluded')]);
    addSearch(sqlite, b, [job('b-job', 90, 'unknown', 'Other job')]);

    assert.equal((await api(request(null, 'evaluations'), env)).status, 401);
    assert.equal(
      (await api(request(a, 'evaluations', 'PUT', evaluation('a-job'), true), env)).status,
      403,
    );
    assert.equal(
      (await api(request(b, 'evaluations', 'PUT', evaluation('a-job')), env)).status,
      404,
    );
    assert.equal(
      (await api(request(a, 'evaluations', 'PUT', evaluation('invented')), env)).status,
      404,
    );
    assert.equal(
      (
        await api(
          request(a, 'evaluations', 'PUT', evaluation('a-job', { relevance: 'maybe' })),
          env,
        )
      ).status,
      422,
    );
    assert.equal(
      (await api(request(a, 'evaluations', 'PUT', evaluation('a-job', { userId: b })), env)).status,
      422,
    );
    assert.equal(
      (
        await api(
          request(a, 'evaluations', 'PUT', evaluation('a-job', { notes: 'X'.repeat(1001) })),
          env,
        )
      ).status,
      422,
    );
    assert.equal(
      (
        await api(
          request(a, 'evaluations', 'PUT', evaluation('a-job', { notes: 'X'.repeat(5000) })),
          env,
        )
      ).status,
      413,
    );

    const write = await api(
      request(a, 'evaluations', 'PUT', evaluation('a-job', { notes: ' =2+2\nprivate' })),
      env,
    );
    assert.equal(write.status, 200);
    const first = (await write.json()) as Evaluation;
    assert.equal(first.title, '=SUM(1,1)');
    assert.equal(first.score, 80);
    assert.equal(first.scoreVersion, 'rules-v2');
    assert.equal(first.salarySnapshot.min, 10);
    assert.equal(first.predictedKorea, 'confirmed');
    assert.equal(first.languageEvidence, '언어 표현: Korean');
    assert.ok(!JSON.stringify(first).includes('account-a'));
    assert.ok(!JSON.stringify(first).includes('PRIVATE_JOB_DESCRIPTION'));
    const persisted = sqlite
      .prepare('SELECT * FROM job_evaluations WHERE user_id=? AND job_id=?')
      .get(a, 'a-job');
    assert.ok(persisted);
    assert.ok(!JSON.stringify(persisted).includes('PRIVATE_JOB_DESCRIPTION'));

    const bList = (await (await api(request(b, 'evaluations'), env)).json()) as {
      items: Evaluation[];
    };
    assert.deepEqual(bList.items, []);
    assert.equal(
      (await api(request(b, 'evaluations', 'DELETE', { jobId: 'a-job' }), env)).status,
      200,
    );
    assert.equal(
      ((await (await api(request(a, 'evaluations'), env)).json()) as { items: Evaluation[] }).items
        .length,
      1,
    );

    // A later search no longer contains the posting. The owner may still edit their existing record.
    addSearch(sqlite, a, []);
    const update = await api(
      request(
        a,
        'evaluations',
        'PUT',
        evaluation('a-job', {
          relevance: 'yes',
          korea: 'unknown',
          salary: 'correct',
          language: 'correct',
          notes: 'revised',
        }),
      ),
      env,
    );
    assert.equal(update.status, 200);
    const edited = (await update.json()) as Evaluation;
    assert.equal(edited.relevance, 'yes');
    assert.equal(edited.score, 80);
    assert.equal(edited.createdAt, first.createdAt);
    assert.equal((await api(request(a, 'evaluations', 'PUT', evaluation('low')), env)).status, 404);
    assert.equal(
      (await api(request(b, 'evaluations', 'PUT', evaluation('b-job')), env)).status,
      200,
    );

    assert.equal((await api(request(a, 'data', 'DELETE'), env)).status, 200);
    assert.equal(
      ((await (await api(request(a, 'evaluations'), env)).json()) as { items: Evaluation[] }).items
        .length,
      0,
    );
    assert.equal(
      ((await (await api(request(b, 'evaluations'), env)).json()) as { items: Evaluation[] }).items
        .length,
      1,
    );
    assert.equal(
      (await api(request(b, 'evaluations', 'DELETE', { jobId: 'b-job' }), env)).status,
      200,
    );
    assert.equal(
      ((await (await api(request(b, 'evaluations'), env)).json()) as { items: Evaluation[] }).items
        .length,
      0,
    );
  } finally {
    sqlite.close();
  }
});

test('reports declare denominators; exports omit identity, source description and notes by default', async () => {
  const { sqlite, env } = localDatabase();
  try {
    addSearch(sqlite, 'a', [
      job('high', 80, 'confirmed', '=1+1'),
      job('low', 20, 'excluded', '+CMD'),
      job('unknown', undefined, 'unknown'),
    ]);
    for (const payload of [
      evaluation('high', { notes: '+PRIVATE_CSV_FORMULA' }),
      evaluation('low', { relevance: 'no', korea: 'no', salary: 'correct', language: 'correct' }),
      evaluation('unknown', {
        relevance: 'uncertain',
        korea: 'unknown',
        salary: 'unknown',
        language: 'unknown',
      }),
    ])
      assert.equal((await api(request('a', 'evaluations', 'PUT', payload), env)).status, 200);

    const { items, report } = (await (await api(request('a', 'evaluations'), env)).json()) as {
      items: Evaluation[];
      report: ReturnType<typeof evaluationReport>;
    };
    assert.equal(items.length, 3);
    assert.deepEqual(report.relevance, {
      yes: 0,
      no: 2,
      uncertain: 1,
      comparisonDenominator: 2,
      agreement: 1,
      predictedRelevantDenominator: 1,
      falsePositive: 1,
    });
    assert.deepEqual(report.korea, {
      comparisonDenominator: 2,
      agreement: 2,
      unknownOrUncomparable: 1,
    });
    assert.deepEqual(report.salary, { assessedDenominator: 2, correct: 1, wrong: 1, unknown: 1 });
    assert.deepEqual(report.language, { assessedDenominator: 2, correct: 1, wrong: 1, unknown: 1 });
    assert.equal(report.smallSample, true);

    const csvResponse = await api(request('a', 'evaluations/export?format=csv'), env);
    assert.equal(csvResponse.status, 200);
    assert.match(csvResponse.headers.get('Content-Type') ?? '', /text\/csv/);
    assert.match(csvResponse.headers.get('Cache-Control') ?? '', /no-store/);
    const csv = await csvResponse.text();
    // Response.text() strips the UTF-8 BOM; raw export contains it for spreadsheet imports.
    assert.ok(evaluationCsv(items).startsWith('\uFEFF'));
    assert.ok(csv.includes('"\'=1+1"'));
    assert.ok(csv.includes('"\'+CMD"'));
    assert.ok(!csv.includes('PRIVATE_CSV_FORMULA'));
    assert.ok(!csv.includes('PRIVATE_JOB_DESCRIPTION'));
    assert.ok(!csv.includes('user_id'));
    assert.ok(!csv.includes('account-a'));

    const withNotes = (await (
      await api(request('a', 'evaluations/export?format=json&includeNotes=1'), env)
    ).json()) as { items: Evaluation[] };
    assert.equal(
      withNotes.items.find((item) => item.jobId === 'high')?.notes,
      '+PRIVATE_CSV_FORMULA',
    );
    const defaultJson = (await (
      await api(request('a', 'evaluations/export?format=json'), env)
    ).json()) as { items: Evaluation[] };
    assert.ok(defaultJson.items.every((item) => item.notes === ''));
    assert.equal(
      (await api(request('a', 'evaluations/export?format=json&other=1'), env)).status,
      400,
    );
    assert.equal(
      (await api(request('a', 'evaluations/export?format=json&format=csv'), env)).status,
      400,
    );
    assert.match(evaluationCsv(items), /'\+PRIVATE_CSV_FORMULA/);
  } finally {
    sqlite.close();
  }
});

test('validation rejects missing fields, non-string pseudo-enums, unsupported metadata and bad notes', () => {
  for (const payload of [
    { ...evaluation('id'), language: undefined },
    { ...evaluation('id'), relevance: { toString: () => 'yes' } },
    { ...evaluation('id'), notes: null },
    { ...evaluation('id'), notes: 'bad\u0000note' },
    { ...evaluation('id'), score: 100 },
  ])
    assert.throws(() => validateEvaluation(payload), /평가|메모|관련성|언어/);
  assert.equal(validateEvaluation({ ...evaluation('id'), notes: '\n valid \n' }).notes, 'valid');
});
