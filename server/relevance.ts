import type { Job, Profile } from '../src/domain';

export const SCORE_VERSION = 'rules-v2';
export type ScoreBreakdown = {
  role: number;
  skills: number;
  language: number;
  experience: number;
  workCondition: number;
};
export type MatchScore = {
  matchScore: number;
  matchScoreLabel: 'high' | 'medium' | 'low';
  scoreExplanation: string;
  matchedEvidence: string[];
  missingEvidence: string[];
  scoreVersion: string;
  scoreBasis: 'rules';
  scoreBreakdown: ScoreBreakdown;
};

// Different spellings of the *same* language count once, including a Korean/한국어 résumé versus an English title.
const LANGUAGE_ALIASES: Record<string, readonly string[]> = {
  Korean: ['Korean', '한국어', '국어'],
  English: ['English', '영어'],
  Spanish: ['Spanish', '스페인어'],
  Arabic: ['Arabic', '아랍어'],
  French: ['French', '프랑스어'],
  German: ['German', '독일어'],
  Portuguese: ['Portuguese', '포르투갈어'],
  Japanese: ['Japanese', '일본어'],
  Chinese: ['Chinese', '중국어', 'Mandarin', '중국어(보통화)'],
  Farsi: ['Farsi', 'Persian', '페르시아어'],
  Malayalam: ['Malayalam', '말라얄람어'],
  Hindi: ['Hindi', '힌디어'],
  Italian: ['Italian', '이탈리아어'],
  Dutch: ['Dutch', '네덜란드어'],
  Russian: ['Russian', '러시아어'],
  Thai: ['Thai', '태국어'],
  Vietnamese: ['Vietnamese', '베트남어'],
  Turkish: ['Turkish', '터키어'],
  Indonesian: ['Indonesian', '인도네시아어'],
};

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export function matchesTextTerm(text: string, term: string): boolean {
  const needle = term.trim();
  if (!needle) return false;
  // Korean compounds often omit spaces (한국어강사); Latin words still need lexical boundaries.
  if (/[가-힣]/.test(needle)) return text.toLowerCase().includes(needle.toLowerCase());
  return new RegExp(`(^|[^a-z0-9])${escape(needle)}(?=$|[^a-z0-9])`, 'i').test(text);
}

function canonicalLanguages(values: readonly string[]): string[] {
  return Object.entries(LANGUAGE_ALIASES)
    .filter(([, aliases]) => values.some((v) => aliases.some((alias) => matchesTextTerm(v, alias))))
    .map(([name]) => name);
}

export function titleLanguages(title: string): string[] {
  return canonicalLanguages([title]);
}

export function missingTitleLanguages(
  title: string,
  profileLanguages: readonly string[],
): string[] {
  const available = new Set(canonicalLanguages(profileLanguages));
  return titleLanguages(title).filter((name) => !available.has(name));
}

const ROLE_GROUPS: readonly (readonly string[])[] = [
  [
    'annotation',
    'annotator',
    'data labeler',
    'data labeling',
    'ai trainer',
    '데이터 주석',
    '데이터 라벨링',
  ],
  ['evaluation', 'evaluator', 'rater', 'ai 평가', '응답 평가', '평가자'],
  [
    'transcription',
    'transcriptionist',
    'transcriber',
    'speech data',
    'voice data',
    '음성 전사',
    '전사',
  ],
  [
    'linguistic qa',
    'language qa',
    'language reviewer',
    'language specialist',
    'linguistic quality',
    '언어 검수',
    '언어 품질',
  ],
  ['localization', 'translation', 'translator', '번역', '현지화'],
  [
    'teacher',
    'teaching',
    'tutor',
    'instructor',
    'curriculum',
    'assessment',
    '강사',
    '교사',
    '교육',
    '학습 평가',
  ],
  ['data operations', 'dataset operations', 'data quality', '데이터 운영'],
];
const stop = new Set([
  'ai',
  'data',
  'language',
  'quality',
  'qa',
  'remote',
  'work',
  'the',
  'and',
  'or',
]);
const words = (items: string[]) =>
  items.flatMap((s) =>
    s
      .toLowerCase()
      .split(/[^a-z0-9가-힣]+/)
      .filter((w) => w.length >= 3 && !stop.has(w)),
  );

export function matchesSearchKeyword(text: string, keyword: string): boolean {
  if (matchesTextTerm(text, keyword)) return true;
  const languages = titleLanguages(keyword);
  if (languages.length && languages.some((language) => titleLanguages(text).includes(language)))
    return true;
  return ROLE_GROUPS.some(
    (aliases) =>
      aliases.some((alias) => matchesTextTerm(keyword, alias)) &&
      aliases.some((alias) => matchesTextTerm(text, alias)),
  );
}

function roleKeywords(profile: Profile): string[] {
  const explicit = (profile.primaryRoleKeywords ?? []).filter(Boolean);
  const supplied = (
    explicit.length
      ? explicit
      : profile.keywords.filter((word) =>
          ROLE_GROUPS.some((aliases) => aliases.some((alias) => matchesTextTerm(word, alias))),
        )
  ).filter(Boolean);
  const groups = ROLE_GROUPS.filter((aliases) =>
    supplied.some((word) => aliases.some((alias) => matchesTextTerm(word, alias))),
  );
  // A generic search keyword (e.g. Python) is not automatically a verified job role.
  return [...new Set([...explicit, ...groups.flat()])];
}

export function scoreJob(profile: Profile, job: Job): MatchScore {
  const title = `${job.title} ${job.company}`;
  const body = job.description;
  const all = `${title} ${body}`;
  const roles = roleKeywords(profile);
  const skills = [
    ...new Set(
      (profile.skillKeywords?.length ? profile.skillKeywords : profile.skills).filter(Boolean),
    ),
  ];
  const languages = profile.languageKeywords?.length ? profile.languageKeywords : profile.languages;
  const matchedEvidence: string[] = [];
  const missingEvidence: string[] = [];

  const roleHits = roles.filter((k) => matchesTextTerm(title, k));
  const roleBodyHits = roles.filter(
    (k) => !roleHits.includes(k) && matchesTextTerm(body.slice(0, 5000), k),
  );
  const role = roles.length ? (roleHits.length ? 30 : roleBodyHits.length ? 14 : 0) : 0;
  roleHits.slice(0, 5).forEach((k) => matchedEvidence.push(`직무 제목 표현: ${k}`));
  if (!roleHits.length)
    roleBodyHits.slice(0, 3).forEach((k) => matchedEvidence.push(`업무 본문 언급: ${k}`));
  if (!role) missingEvidence.push('핵심 직무의 직접 일치 미확인');

  const skillHits = skills.filter((k) => matchesTextTerm(all, k));
  const skillsScore = skills.length
    ? Math.round(30 * Math.min(1, skillHits.length / Math.min(4, skills.length)))
    : 0;
  skillHits.slice(0, 6).forEach((k) => matchedEvidence.push(`기술·업무 표현: ${k}`));
  if (!skillHits.length) missingEvidence.push('기술·업무 키워드 일치 미확인');

  const namedLanguages = canonicalLanguages(languages);
  const languageHits = namedLanguages.filter((name) =>
    LANGUAGE_ALIASES[name].some((alias) => matchesTextTerm(all, alias)),
  );
  const language = namedLanguages.length && languageHits.length ? 15 : 0;
  languageHits.forEach((name) => matchedEvidence.push(`언어 표현: ${name}`));
  if (namedLanguages.length && !languageHits.length)
    missingEvidence.push('사용 가능 언어의 공고 내 표기 미확인');
  const titleMissing = missingTitleLanguages(job.title, languages);
  if (titleMissing.length)
    missingEvidence.push(`공고 제목 언어 자격 미확인: ${titleMissing.join(', ')}`);

  const experienceText = profile.experience.join(' ').toLowerCase();
  const expHits = words(profile.experience)
    .filter((w) => w.length > 3 && matchesTextTerm(all, w))
    .slice(0, 5);
  const typeHits = [
    'annotat',
    'evaluat',
    'transcri',
    'linguist',
    'qa',
    'localiz',
    'translat',
    'speech',
    'voice',
  ].filter((stem) => experienceText.includes(stem) && all.toLowerCase().includes(stem));
  const experience = experienceText && (expHits.length || typeHits.length) ? 15 : 0;
  if (experience) matchedEvidence.push('경력 관련 표현 일치');
  else if (experienceText) missingEvidence.push('경력·업무 유형의 직접 일치 미확인');

  let workCondition = 0;
  if (job.workMode === '원격') workCondition += 5;
  if (job.korea === 'confirmed') workCondition += 5;
  if (job.workMode !== '원격') missingEvidence.push('원격 근무 명시 미확인');
  if (job.korea !== 'confirmed')
    missingEvidence.push(
      job.korea === 'excluded' ? '한국 제외 조건 명시' : '한국 근무 가능 여부 미확인',
    );

  const rawScore = role + skillsScore + language + experience + workCondition;
  // A keyword appearing only in boilerplate cannot justify a high match.
  const score = Math.max(0, Math.min(role === 0 ? 44 : roleHits.length === 0 ? 59 : 100, rawScore));
  return {
    matchScore: score,
    matchScoreLabel: score >= 70 ? 'high' : score >= 45 ? 'medium' : 'low',
    scoreExplanation: `직무 ${role}/30 · 기술 ${skillsScore}/30 · 언어 ${language}/15 · 경력 ${experience}/15 · 근무조건 ${workCondition}/10`,
    matchedEvidence,
    missingEvidence,
    scoreVersion: SCORE_VERSION,
    scoreBasis: 'rules',
    scoreBreakdown: { role, skills: skillsScore, language, experience, workCondition },
  };
}
