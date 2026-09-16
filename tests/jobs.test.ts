import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalize, plain, sources } from '../server/jobs';

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
