import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidSourceUrl, parseAtsFeed, sources, type AtsSource } from '../server/ats';
import { normalize } from '../server/jobs';

const lever = {
  id: 'lever-123',
  text: 'Korean Language Specialist',
  absolute_url: 'https://jobs.lever.co/weloglobal/lever-123',
  createdAt: 1789950000000,
  descriptionPlain: 'Korean fluency required',
  categories: { allLocations: ['Remote'], commitment: 'Contract' },
};
const greenhouse = {
  id: 8187545,
  title: 'Localization Specialist',
  absolute_url: 'https://www.coupang.jobs/en/jobs/?gh_jid=8187545',
  location: { name: 'Seoul, South Korea' },
  content: '<p>Localization work</p>',
};
const ashby = {
  id: 'ashby-123',
  title: 'Infrastructure Engineer',
  location: 'San Francisco',
  jobUrl: 'https://jobs.ashbyhq.com/mercor/ashby-123',
  isListed: true,
  descriptionHtml: '<p>Infrastructure role</p>',
};

test('three typed company sources retain their exact verified provider URLs and names', () => {
  assert.deepEqual(
    sources.map(({ id, type }) => [id, type]),
    [
      ['welo', 'lever'],
      ['coupang', 'greenhouse'],
      ['mercor', 'ashby'],
    ],
  );
  assert.ok(sources.every(isValidSourceUrl));
  for (const source of sources) {
    assert.equal(
      isValidSourceUrl({ ...source, url: source.url.replace('https://', 'http://') }),
      false,
    );
    assert.equal(isValidSourceUrl({ ...source, url: source.url + '&unexpected=1' }), false);
    assert.equal(
      isValidSourceUrl({ ...source, url: source.url.replace('://', '://attacker@') }),
      false,
    );
  }
  assert.equal(
    isValidSourceUrl({
      ...sources[2],
      url: 'https://api.ashbyhq.com.evil.com/posting-api/job-board/mercor?includeCompensation=true',
    }),
    false,
  );
});

test('provider-specific envelopes decode real posting fields; no new boards needed', () => {
  assert.deepEqual(parseAtsFeed([lever], 'lever'), [lever]);
  assert.equal(
    normalize(parseAtsFeed([lever], 'lever')[0], sources[0], '2026-09-21T05:00:00Z').postedAt,
    new Date(lever.createdAt).toISOString(),
  );
  assert.deepEqual(parseAtsFeed({ jobs: [greenhouse] }, 'greenhouse'), [greenhouse]);
  assert.deepEqual(parseAtsFeed({ jobs: [ashby] }, 'ashby'), [ashby]);
  assert.deepEqual(parseAtsFeed({ jobs: [] }, 'ashby'), []);
  const normalized = normalize(
    parseAtsFeed({ jobs: [greenhouse] }, 'greenhouse')[0],
    sources[1],
    '2026-09-21T05:00:00Z',
  );
  assert.equal(normalized.id, 'coupang:8187545');
  assert.equal(normalized.url, greenhouse.absolute_url);
  assert.match(normalized.sourceStatus, /외부 지원 링크/);
  assert.equal(normalized.korea, 'confirmed');
});

test('wrong response envelope and completely malformed board fail visibly', () => {
  assert.throws(() => parseAtsFeed({ jobs: [lever] }, 'lever'), /응답 형식 변경/);
  assert.throws(() => parseAtsFeed([greenhouse], 'greenhouse'), /응답 형식 변경/);
  assert.throws(() => parseAtsFeed(null, 'ashby'), /응답 형식 변경/);
  assert.throws(
    () => parseAtsFeed({ jobs: [{ id: 'x', title: '' }] }, 'ashby'),
    /공고 항목 형식 변경/,
  );
});

test('partially malformed rows are discarded before normalization without losing valid jobs', () => {
  const mixed = parseAtsFeed(
    {
      jobs: [
        ashby,
        null,
        { ...ashby, id: '' },
        { ...ashby, id: 'bad-nested', salaryRange: { min: '100' } },
        { ...ashby, id: 'bad-lists', lists: [null] },
        { ...ashby, id: 'not-listed', isListed: false },
      ],
    },
    'ashby',
  );
  assert.deepEqual(
    mixed.map((job) => job.id),
    ['ashby-123', 'not-listed'],
  );
  assert.equal(mixed[1].isListed, false);
});

test('source config validation rejects nonofficial and mismatched provider hosts', () => {
  const invalid: AtsSource = {
    id: 'other',
    name: 'Other',
    company: 'Other',
    type: 'lever',
    url: 'https://api.ashbyhq.com/posting-api/job-board/mercor?includeCompensation=true',
  };
  assert.equal(isValidSourceUrl(invalid), false);
});
