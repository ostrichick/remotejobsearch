import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  scoreJob,
  SCORE_VERSION,
  titleLanguages,
  missingTitleLanguages,
  matchesSearchKeyword,
} from '../server/relevance';
import type { Job, Profile } from '../src/domain';
const profile = {
  skills: ['annotation', 'QA'],
  languages: ['Korean'],
  experience: ['AI data annotation'],
  education: [],
  keywords: ['annotation', 'evaluation'],
  mode: 'local',
} as Profile;
const job = {
  id: '1',
  title: 'Korean AI Data Annotator',
  company: 'Example',
  description: 'Perform data annotation and quality evaluation for Korean content.',
  location: 'South Korea',
  contract: '프리랜서',
  workMode: '원격',
  korea: 'confirmed',
  hours: '5-20 hours per week',
  match: [],
  compensation: { min: null, max: null, currency: null, unit: null, note: '' },
  source: 'x',
  sourceUrl: 'https://x.test',
  url: 'https://x.test/1',
  postedAt: null,
  fetchedAt: '2026-01-01',
  checkedAt: '2026-01-01',
  status: 'open',
  kind: '개별 공고',
  sourceStatus: 'x',
  platform: null,
} as Job;
test('score is deterministic and records weighted evidence', () => {
  const a = scoreJob(profile, job),
    b = scoreJob(profile, job);
  assert.deepEqual(a, b);
  assert.equal(a.scoreVersion, SCORE_VERSION);
  assert.ok(a.matchScore >= 70);
  assert.ok(a.matchedEvidence.some((x) => x.includes('직무')));
});
test('skill-only unrelated job is low relevance', () => {
  const a = scoreJob(profile, {
    ...job,
    title: 'English Tutor',
    description: 'Teach students. AI tools are used for scheduling.',
    korea: 'unknown',
    workMode: '미기재',
  });
  assert.equal(a.matchScoreLabel, 'low');
  assert.ok(a.matchScore < 45);
});

test('English and Korean language labels are grouped across both writing systems', () => {
  assert.deepEqual(titleLanguages('한국어 / Korean & English / 영어 AI Annotator'), [
    'Korean',
    'English',
  ]);
  assert.deepEqual(missingTitleLanguages('한국어 Korean AI Evaluator', ['Korean']), []);
  assert.deepEqual(missingTitleLanguages('Korean English AI Evaluator', ['한국어']), ['English']);
  assert.deepEqual(missingTitleLanguages('Japanese and Korean Reviewer', ['한국어', '일본어']), []);
  assert.equal(matchesSearchKeyword('한국어 콘텐츠 평가', 'Korean'), true);
  assert.equal(matchesSearchKeyword('AI Data Annotator', 'annotation'), true);
  assert.equal(matchesSearchKeyword('Korean tutor', 'evaluation'), false);
});

test('title language requirements include common European languages outside the original profile set', () => {
  assert.deepEqual(titleLanguages('AI Trainers Network - Norwegian'), ['Norwegian']);
  assert.deepEqual(
    missingTitleLanguages('Norwegian Linguist Reviewer', ['Korean', 'English', 'Spanish']),
    ['Norwegian'],
  );
  assert.deepEqual(
    missingTitleLanguages('Swedish Language Expert', ['한국어', '영어', '스페인어']),
    ['Swedish'],
  );
  assert.deepEqual(
    missingTitleLanguages('Shape the Future of AI — Ilocano Talent Hub', ['English']),
    ['Ilocano'],
  );
  assert.deepEqual(missingTitleLanguages('Spanish AI Evaluator', ['Spanish']), []);
});

test('title-role match outranks body-only boilerplate and does not misstate missing eligibility', () => {
  const p = { ...profile, primaryRoleKeywords: ['annotation'] };
  const title = scoreJob(p, {
    ...job,
    title: 'Korean Data Annotator',
    description: 'Korean annotation experience needed.',
  });
  const body = scoreJob(p, {
    ...job,
    title: 'Korean Sales Executive',
    description: 'Our annotation research division partners with sales.',
  });
  assert.ok(title.matchScore > body.matchScore);
  assert.ok(body.matchScore <= 59);
  assert.equal(title.scoreVersion, 'rules-v2');
  const unknown = scoreJob(p, { ...job, korea: 'unknown', workMode: '원격' });
  assert.ok(unknown.missingEvidence.some((x) => x.includes('한국 근무 가능 여부 미확인')));
  const excluded = scoreJob(p, { ...job, korea: 'excluded' });
  assert.ok(excluded.missingEvidence.some((x) => x.includes('한국 제외 조건')));
});

test('a generic technical keyword is not automatically treated as a proven target role', () => {
  const p = {
    ...profile,
    skills: ['Python'],
    keywords: ['Python'],
    primaryRoleKeywords: [],
    skillKeywords: ['Python'],
  };
  const candidate = {
    ...job,
    title: 'Python Developer',
    description: 'Python development, strong Python skills.',
  };
  const inferred = scoreJob(p, candidate);
  assert.equal(inferred.scoreBreakdown.role, 0);
  assert.ok(inferred.matchScore <= 44);
  const explicit = scoreJob({ ...p, primaryRoleKeywords: ['Python Developer'] }, candidate);
  assert.equal(explicit.scoreBreakdown.role, 30);
});
