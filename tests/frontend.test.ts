import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { hasSearchKeyword, validLinkedinUrl } from '../src/api';
import ProfilePanel from '../src/components/ProfilePanel';
import ResultsPanel from '../src/components/ResultsPanel';
import { defaultFilters, type Job, type Profile, type SearchResult } from '../src/domain';

const noop = () => {};
const profile: Profile = {
  skills: [],
  languages: [],
  experience: [],
  education: [],
  keywords: ['QA'],
  mode: 'local',
};

test('LinkedIn is restricted to a real https personal profile and may be omitted', () => {
  assert.equal(validLinkedinUrl(''), true);
  assert.equal(validLinkedinUrl(' https://www.linkedin.com/in/example-123/ '), true);
  assert.equal(validLinkedinUrl('https://www.linkedin.com/company/example'), false);
  assert.equal(validLinkedinUrl('https://www.linkedin.com.evil.test/in/example'), false);
  assert.equal(validLinkedinUrl('https://user@www.linkedin.com/in/example'), false);
  assert.equal(validLinkedinUrl('http://www.linkedin.com/in/example'), false);
});

test('search only enables for valid non-contact keywords', () => {
  assert.equal(hasSearchKeyword(['Q', ' ', 'me@example.com']), false);
  assert.equal(hasSearchKeyword(['QA']), true);
});

function profileHtml(
  options: {
    analysisConsent?: boolean;
    aiAvailable?: boolean;
    aiConsent?: boolean;
    storeOriginal?: boolean;
    file?: File | null;
    linkedin?: string;
  } = {},
) {
  return renderToStaticMarkup(
    createElement(ProfilePanel, {
      profile,
      busy: false,
      dirty: false,
      file: options.file ?? null,
      text: '이력서 테스트를 위한 마흔 글자 이상의 텍스트입니다. 기술과 업무 경험을 담은 실용적인 문서입니다.',
      linkedin: options.linkedin ?? '',
      analysisConsent: options.analysisConsent ?? false,
      aiAvailable: options.aiAvailable ?? false,
      aiConsent: options.aiConsent ?? false,
      storeOriginal: options.storeOriginal ?? false,
      resume: null,
      onFileChange: noop,
      onTextChange: noop,
      onLinkedinChange: noop,
      onAnalysisConsentChange: noop,
      onAiConsentChange: noop,
      onStoreOriginalChange: noop,
      onEdit: noop,
      onAnalyze: noop,
      onSave: noop,
      onFindJobs: noop,
      onDeleteResume: noop,
    }),
  );
}

test('analysis consent is required and optional external AI consent only appears when available', () => {
  const initial = profileHtml();
  assert.match(initial, /추출 텍스트를 서버로 보내 분석/);
  assert.doesNotMatch(initial, /OpenAI API로 추출 텍스트를 전송해 AI로 분석/);
  assert.match(initial, /disabled=""[^>]*>이력서 읽기/);

  const available = profileHtml({ analysisConsent: true, aiAvailable: true });
  assert.match(available, /OpenAI API로 추출 텍스트를 전송해 AI로 분석/);
  assert.match(available, /최대 30일 보관/);
  assert.doesNotMatch(available, /disabled=""[^>]*>이력서 읽기/);
  const invalid = profileHtml({
    analysisConsent: true,
    linkedin: 'https://attacker.test/in/person',
  });
  assert.match(invalid, /주소를 입력하거나 비워 주세요/);
  assert.match(invalid, /disabled=""[^>]*>이력서 읽기/);
});

const job: Job = {
  id: 'job1',
  title: 'Korean QA',
  company: 'Example',
  description: 'Check content',
  location: 'Seoul',
  contract: '계약직',
  compensation: { min: null, max: null, currency: null, unit: null, note: '' },
  workMode: '원격',
  korea: 'confirmed',
  koreaEvidence: '공고 근무지: Seoul',
  hours: null,
  source: 'ATS Test',
  sourceUrl: 'https://example.test/feed',
  url: 'https://example.test/job1',
  postedAt: null,
  fetchedAt: '2026-09-20',
  checkedAt: '2026-09-20',
  status: 'open',
  kind: '개별 공고',
  match: ['언어: Korean'],
  sourceStatus: '공개 ATS',
  platform: null,
  matchScore: 76,
  matchScoreLabel: 'high',
  safetySignals: ['금전 지급 요구 문구'],
};

test('results show comparison evidence, partial failure and score without implying a probability', () => {
  const result: SearchResult = {
    jobs: [job],
    sources: [
      { source: 'ATS Test', count: 1, cached: false, checkedAt: '2026-09-20' },
      { source: 'Other ATS', count: 0, cached: false, checkedAt: null, error: '조회 실패' },
    ],
    searchedAt: '2026-09-21',
    previousSearchedAt: '2026-09-20',
    newJobIds: ['job1'],
    keywords: ['Korean'],
  };
  const html = renderToStaticMarkup(
    createElement(ResultsPanel, {
      result,
      saved: [],
      savedOnly: false,
      newOnly: false,
      searchOutdated: true,
      showLow: false,
      filters: defaultFilters,
      visible: [job],
      allJobs: [job],
      busy: false,
      onToggleSavedOnly: noop,
      onNewOnly: noop,
      onShowLow: noop,
      onField: noop,
      onOpenDetail: noop,
      onSave: noop,
      onFindJobs: noop,
    }),
  );
  assert.match(html, /2개 출처 중 1개 조회에 실패/);
  assert.match(html, /변경 전 기준/);
  assert.match(html, /처음 발견한 공고: 1건/);
  assert.match(html, /이번 검색에서 새로 발견/);
  assert.match(html, /76\/100/);
  assert.match(html, /채용 자격 별도 확인/);
  assert.match(html, /확인할 조건 1건/);
  assert.match(html, /합격 확률이 아닙니다/);
});
