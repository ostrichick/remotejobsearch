import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compensation, koreaStatus, normalize, plain, sources } from '../server/jobs';

test('plain strips html but preserves paragraphs', () => {
  assert.equal(
    plain('<b>Hello</b> <i>world</i><br/>Second').replace(/\s+/g, ' ').trim(),
    'Hello world Second',
  );
  assert.equal(plain('<p>a&nbsp;b</p><p>c&amp;d</p>').includes('c&d'), true);
  assert.equal(plain('a&nbsp;b&amp;c&#39;d&quot;e'), 'a b&c\'d"e');
});

test('normalize merges lever lists and detects contract/work-mode/korea', () => {
  const raw = {
    id: 'l1',
    text: 'Korean AI Annotator',
    categories: { allLocations: ['Seoul, South Korea'], commitment: 'Contract' },
    lists: [{ text: 'Requirements', content: 'Korean native speaker' }],
    workplaceType: 'Remote',
    absolute_url: 'https://jobs.lever.co/example/l1',
    publishedAt: '2026-09-10T00:00:00Z',
  };
  const j = normalize(raw, sources[0], '2026-09-11T00:00:00Z');
  assert.equal(j.id, 'welo:l1');
  assert.equal(j.contract, '계약직');
  assert.equal(j.workMode, '원격');
  assert.equal(j.korea, 'confirmed');
  assert.ok(j.description.includes('Requirements'));
  assert.equal(j.platform, 'welo');
});

test('normalize greenhouse uses content and postedAt null fallback', () => {
  const raw = {
    id: 'g1',
    title: 'Content Review',
    content: 'Onsite role',
    location: { name: 'Seoul' },
    employmentType: 'Full-time',
    workplaceType: 'Onsite',
    jobUrl: 'https://boards.greenhouse.io/example/g1',
  };
  const j = normalize(raw, sources[1], '2026-09-11T00:00:00Z');
  assert.equal(j.workMode, '출근');
  assert.equal(j.contract, '정규직');
  assert.equal(j.korea, 'confirmed');
  assert.equal(j.postedAt, null);
  assert.equal(j.platform, null);
});

test('normalize ashby uses descriptionPlain and isRemote flag', () => {
  const raw = {
    id: 'a1',
    text: 'Data Labeler',
    descriptionHtml: 'Label data',
    location: 'Remote',
    workplaceType: 'Remote',
    jobUrl: 'https://jobs.ashbyhq.com/example/a1',
    isRemote: true,
    salaryRange: { min: 30, max: 40, currency: 'USD', interval: 'hour' },
  };
  const j = normalize(raw, sources[2], '2026-09-11T00:00:00Z');
  assert.equal(j.workMode, '원격');
  assert.equal(j.compensation.min, 30);
  assert.equal(j.compensation.unit, 'hour');
  assert.equal(j.compensation.currency, 'USD');
  assert.equal(j.platform, 'mercor');
});

test('sources are unique and use supported ATS types', () => {
  const ids = new Set(sources.map((s) => s.id));
  const types = new Set(['lever', 'greenhouse', 'ashby'] as const);
  assert.equal(ids.size, sources.length);
  assert.ok(sources.every((s) => types.has(s.type)));
  assert.ok(sources.every((s) => s.url.startsWith('https://')));
});

test('korea only confirmed when location or residence stated', () => {
  const raw = {
    id: 'r1',
    text: 'Reviewer',
    descriptionHtml: 'Remote work',
    location: 'Remote',
    workplaceType: 'Remote',
    jobUrl: 'https://x.example/j',
  };
  const j = normalize(raw, sources[2], '2026-09-11T00:00:00Z');
  assert.equal(j.korea, 'unknown');
});

test('North Korea and DPRK are never mistaken for South Korea', () => {
  for (const location of [
    'North Korea',
    'Pyongyang, DPRK',
    '북한',
    'Korea, Democratic Peoples Republic of',
  ]) {
    assert.equal(koreaStatus(location, '').korea, 'excluded', location);
  }
  assert.equal(koreaStatus('Korea, Republic of', '').korea, 'confirmed');
  assert.equal(koreaStatus('Remote', 'Applicants based in North Korea').korea, 'unknown');
  assert.equal(koreaStatus('Seoul, South Korea', 'Not eligible for South Korea').korea, 'excluded');
  assert.equal(koreaStatus('Remote', 'Remote globally, Korea not specified').korea, 'unknown');
});

test('compensation retains lower/upper semantics and never invents currency or pay unit', () => {
  assert.deepEqual(compensation('Pay from USD 25 per hour'), {
    min: 25,
    max: null,
    currency: 'USD',
    unit: 'hour',
    note: 'Pay from USD 25 per hour',
  });
  assert.deepEqual(compensation('Pay up to USD 40 per hour'), {
    min: null,
    max: 40,
    currency: 'USD',
    unit: 'hour',
    note: 'Pay up to USD 40 per hour',
  });
  assert.equal(
    compensation('Pay $30 per hour').currency,
    null,
    'unqualified dollars are ambiguous',
  );
  assert.equal(compensation('Equipment stipend: USD 500 per year').min, null);
  assert.equal(compensation('Annual salary USD 100,000-80,000').min, null);
  assert.equal(compensation('Pay approximately USD 30 per hour').min, null);
  assert.deepEqual(compensation('Buy a laptop for USD 500'), {
    min: null,
    max: null,
    currency: null,
    unit: null,
    note: '',
  });
});

test('bad structured compensation remains unknown or falls back to explicit original pay', () => {
  const input = {
    id: 'bad-pay',
    title: 'Korean reviewer',
    descriptionPlain: 'Pay USD 30 per hour',
    location: 'Remote',
    workplaceType: 'Remote',
    jobUrl: 'https://jobs.ashbyhq.com/mercor/bad-pay',
    salaryRange: { min: 40, max: 30, currency: '$', interval: 'hour' },
  };
  const fallback = normalize(input, sources[2], '2026-09-11T00:00:00Z');
  assert.equal(fallback.compensation.min, 30);
  assert.equal(fallback.compensation.currency, 'USD');
  const upper = normalize(
    { ...input, salaryRange: { max: 70, currency: '$', interval: 'year' } },
    sources[2],
    '2026-09-11T00:00:00Z',
  );
  assert.equal(upper.compensation.min, null);
  assert.equal(upper.compensation.max, 70);
  assert.equal(upper.compensation.currency, null);
});

test('explicit advance-payment signal is attached as a review clue, not a fraud finding', () => {
  const j = normalize(
    {
      id: 'risky',
      title: 'Korean AI Evaluator',
      descriptionPlain: 'Applicants must pay a training fee before work begins.',
      location: 'Remote',
      workplaceType: 'Remote',
      jobUrl: 'https://jobs.ashbyhq.com/mercor/risky',
    },
    sources[2],
    '2026-09-11T00:00:00Z',
  );
  assert.equal(j.safetySignals?.length, 1);
  assert.match(j.safetySignals?.[0] ?? '', /확인 필요/);
});
