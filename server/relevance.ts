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
  Norwegian: ['Norwegian', '노르웨이어'],
  Swedish: ['Swedish', '스웨덴어'],
  Danish: ['Danish', '덴마크어'],
  Finnish: ['Finnish', '핀란드어'],
  Icelandic: ['Icelandic', '아이슬란드어'],
  Polish: ['Polish', 'Polski', 'Język polski', '폴란드어'],
  Czech: ['Czech', '체코어'],
  Slovak: ['Slovak', '슬로바키아어'],
  Slovenian: ['Slovenian', '슬로베니아어'],
  Croatian: ['Croatian', '크로아티아어'],
  Serbian: ['Serbian', '세르비아어'],
  Bosnian: ['Bosnian', '보스니아어'],
  Bulgarian: ['Bulgarian', '불가리아어'],
  Romanian: ['Romanian', '루마니아어'],
  Hungarian: ['Hungarian', '헝가리어'],
  Greek: ['Greek', '그리스어'],
  Ukrainian: ['Ukrainian', '우크라이나어'],
  Belarusian: ['Belarusian', '벨라루스어'],
  Estonian: ['Estonian', '에스토니아어'],
  Latvian: ['Latvian', '라트비아어'],
  Lithuanian: ['Lithuanian', '리투아니아어'],
  Albanian: ['Albanian', '알바니아어'],
  Macedonian: ['Macedonian', '마케도니아어'],
  Catalan: ['Catalan', '카탈루냐어'],
  Basque: ['Basque', '바스크어'],
  Galician: ['Galician', '갈리시아어'],
  Irish: ['Irish', '아일랜드어'],
  Welsh: ['Welsh', '웨일스어'],
  Flemish: ['Flemish', '플라망어'],
  Hebrew: ['Hebrew', '히브리어'],
  Bengali: ['Bengali', '벵골어'],
  Urdu: ['Urdu', '우르두어'],
  Punjabi: ['Punjabi', '펀자브어'],
  Gujarati: ['Gujarati', '구자라트어'],
  Marathi: ['Marathi', '마라티어'],
  Tamil: ['Tamil', '타밀어'],
  Telugu: ['Telugu', '텔루구어'],
  Kannada: ['Kannada', '칸나다어'],
  Sinhala: ['Sinhala', '싱할라어'],
  Sindhi: ['Sindhi', '신디어'],
  Assamese: ['Assamese', '아삼어'],
  Odia: ['Odia', 'Oriya', '오리야어'],
  Sanskrit: ['Sanskrit', '산스크리트어'],
  Nepali: ['Nepali', '네팔어'],
  Burmese: ['Burmese', 'Myanmar language', '버마어'],
  Khmer: ['Khmer', '크메르어'],
  Lao: ['Lao', '라오어'],
  Malay: ['Malay', '말레이어'],
  Maltese: ['Maltese', '몰타어'],
  Filipino: ['Filipino', '필리핀어'],
  Tagalog: ['Tagalog', '타갈로그어'],
  Javanese: ['Javanese', '자바어'],
  Sundanese: ['Sundanese', '순다어'],
  Cantonese: ['Cantonese', '광둥어'],
  Armenian: ['Armenian', '아르메니아어'],
  Georgian: ['Georgian', '조지아어'],
  Azerbaijani: ['Azerbaijani', '아제르바이잔어'],
  Kazakh: ['Kazakh', '카자흐어'],
  Kyrgyz: ['Kyrgyz', '키르기스어'],
  Uzbek: ['Uzbek', '우즈베크어'],
  Tajik: ['Tajik', '타지크어'],
  Mongolian: ['Mongolian', '몽골어'],
  Afrikaans: ['Afrikaans', '아프리칸스어'],
  Amharic: ['Amharic', '암하라어'],
  Hausa: ['Hausa', '하우사어'],
  Igbo: ['Igbo', '이그보어'],
  Yoruba: ['Yoruba', '요루바어'],
  Somali: ['Somali', '소말리어'],
  Swahili: ['Swahili', '스와힐리어'],
  Zulu: ['Zulu', '줄루어'],
  Twi: ['Twi', '트위어'],
  Cebuano: ['Cebuano', '세부아노어'],
  Ilocano: ['Ilocano', '일로카노어'],
  Maori: ['Maori', 'Māori', '마오리어'],
  Koro: ['Koro'],
  'British Sign Language': ['British Sign Language', 'BSL', '영국 수어'],
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
