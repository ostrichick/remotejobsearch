import type { Profile } from '../src/domain';
import { validatePreferences } from '../src/preferences';
const terms = [
  'Korean',
  'English',
  'Spanish',
  'Chinese',
  'Japanese',
  'French',
  'German',
  'Portuguese',
  'Arabic',
  '한국어',
  '영어',
  '스페인어',
];
const skills = [
  'annotation',
  'evaluation',
  'transcription',
  'linguistic',
  'localization',
  'translation',
  'teaching',
  'tutor',
  'assessment',
  'QA',
  'data analysis',
  'Python',
  'SQL',
  'JavaScript',
  'TypeScript',
  'React',
  'Java',
  'AWS',
  'Excel',
  'Google Workspace',
  'marketing',
  'accounting',
  'finance',
  'sales',
  'design',
  'customer service',
  'nursing',
  'project management',
  'HR',
  'recruiting',
  '교육',
  '번역',
  '전사',
  '회계',
  '영업',
  '마케팅',
  '디자인',
  '간호',
  '인사',
];
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

type KeywordField =
  'primaryRoleKeywords' | 'skillKeywords' | 'languageKeywords' | 'negativeKeywords';
const keywordFields: readonly KeywordField[] = [
  'primaryRoleKeywords',
  'skillKeywords',
  'languageKeywords',
  'negativeKeywords',
];

function validateStringArray(value: unknown, maxCount: number, maxLength: number): string[] | null {
  if (
    !Array.isArray(value) ||
    value.length > maxCount ||
    value.some((x: unknown) => typeof x !== 'string' || x.length > maxLength)
  )
    return null;
  return (value as string[]).map((x) => x.trim()).filter(Boolean);
}

function validateLinkedinUrl(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value !== 'string' || value.length > 500)
    throw new Error('LinkedIn URL 형식이 올바르지 않습니다.');
  const input = value.trim();
  if (!input) return '';
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('LinkedIn URL 형식이 올바르지 않습니다.');
  }
  if (
    url.protocol !== 'https:' ||
    !['linkedin.com', 'www.linkedin.com'].includes(url.hostname.toLowerCase()) ||
    url.port ||
    url.username ||
    url.password ||
    !/^\/in\/[a-zA-Z0-9_%-]+\/?$/.test(url.pathname)
  )
    throw new Error('LinkedIn URL은 공식 linkedin.com/in 프로필 주소만 허용됩니다.');
  return `https://www.linkedin.com${url.pathname.replace(/\/$/, '')}/`;
}

export function extractProfile(text: string): Profile {
  const lines = text
    .split(/\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const found = skills.filter((s) =>
    new RegExp(`(^|[^a-z])${escapeRegExp(s)}([^a-z]|$)`, 'i').test(text),
  );
  const language = terms.filter((s) => text.toLowerCase().includes(s.toLowerCase()));
  const primaryRoleKeywords = found.filter((s) =>
    /annotat|evaluat|transcri|linguist|localiz|translat|speech|voice|quality rater/i.test(s),
  );
  return {
    skills: found,
    languages: language,
    experience: lines
      .filter(
        (s) =>
          /\b(19|20)\d{2}\b/.test(s) &&
          !/@|linkedin|bachelor|degree|university|학사|대학교/i.test(s),
      )
      .slice(0, 20),
    education: lines
      .filter((s) => /bachelor|degree|university|학사|대학교|master|doctor/i.test(s))
      .slice(0, 10),
    keywords: found.slice(0, 12),
    primaryRoleKeywords,
    skillKeywords: found.filter((s) => !primaryRoleKeywords.includes(s)),
    languageKeywords: language,
    negativeKeywords: [],
    mode: 'local',
  };
}
export function validateProfile(value: unknown): Profile {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('프로필 형식이 올바르지 않습니다.');
  const v = value as Record<string, unknown>;
  const out: Profile = {
    skills: [],
    languages: [],
    experience: [],
    education: [],
    keywords: [],
    mode: 'local',
  };
  for (const k of ['skills', 'languages', 'experience', 'education', 'keywords'] as const) {
    const list = validateStringArray(v[k], 40, 1500);
    if (list === null) throw new Error('프로필 항목 길이나 형식을 확인하세요.');
    out[k] = list;
  }
  out.preferences = validatePreferences(v.preferences);
  out.linkedinUrl = validateLinkedinUrl(v.linkedinUrl);
  for (const k of keywordFields) {
    if (v[k] === undefined) {
      out[k] = [];
      continue;
    }
    const list = validateStringArray(v[k], 30, 150);
    if (list === null) throw new Error('검색 키워드 분류를 확인하세요.');
    out[k] = list;
  }
  out.mode = v.mode === 'ai' ? 'ai' : 'local';
  return out;
}
