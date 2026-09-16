import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractProfile, validateProfile } from '../server/profile';

test('extractProfile pulls skills, languages and keyword buckets from resume text', () => {
  const text = [
    '2024-02 ~ 2025-12 세종학당 한국어 강사',
    '번역·전사 업무, 데이터 전사 및 평가',
    'Python, SQL, Google Workspace 사용',
    '한국어 원어민, 영어 중상급',
    '컴퓨터과학 학사',
  ].join('\n');
  const p = extractProfile(text);
  assert.ok(p.skills.includes('번역'));
  assert.ok(p.skills.includes('전사'));
  assert.ok(p.skills.includes('Python'));
  assert.ok(p.languages.includes('한국어'));
  assert.ok(p.languages.includes('영어'));
  assert.ok(p.experience.some((l) => l.includes('2024')));
  assert.ok(p.education.some((l) => l.includes('학사')));
  assert.ok(p.primaryRoleKeywords.concat(p.skillKeywords).length > 0);
  assert.equal(p.mode, 'local');
});

test('validateProfile rejects oversized or malformed arrays and normalizes input', () => {
  assert.throws(() =>
    validateProfile({
      skills: ['a'.repeat(2000)],
      languages: [],
      experience: [],
      education: [],
      keywords: [],
      mode: 'local',
    }),
  );
  assert.throws(() =>
    validateProfile({
      skills: 'annotation',
      languages: [],
      experience: [],
      education: [],
      keywords: [],
      mode: 'local',
    }),
  );
  const p = validateProfile({
    skills: ['  Python  ', 'annotation'],
    languages: ['Korean'],
    experience: [],
    education: [],
    keywords: ['QA'],
    mode: 'local',
    primaryRoleKeywords: undefined,
  });
  assert.deepEqual(p.skills, ['Python', 'annotation']);
  assert.equal(p.mode, 'local');
  assert.deepEqual(p.primaryRoleKeywords, []);
  assert.deepEqual(p.negativeKeywords, []);
});

test('validateProfile accepts ai mode and optional keyword buckets', () => {
  const p = validateProfile({
    skills: [],
    languages: [],
    experience: [],
    education: [],
    keywords: [],
    mode: 'ai',
    negativeKeywords: ['성형'],
  });
  assert.equal(p.mode, 'ai');
  assert.deepEqual(p.negativeKeywords, ['성형']);
});

test('extractProfile does not treat email or link lines as experience', () => {
  const p = extractProfile('linkedin.com/in/user\nme@example.com\n2020 QA engineer');
  assert.ok(p.experience.every((l) => !/linkedin|@/.test(l)));
  assert.ok(p.experience.some((l) => l.includes('2020')));
});
