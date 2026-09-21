import type { Job } from './domain';
export type Preferences = {
  text: string;
  remote: boolean;
  korea: boolean;
  location: string;
  contract: string;
  maxWeeklyHours: string;
};
export const emptyPreferences: Preferences = {
  text: '',
  remote: false,
  korea: false,
  location: '',
  contract: '',
  maxWeeklyHours: '',
};
export function parsePreferences(text: string): { value: Preferences; notice: string } {
  const value = { ...emptyPreferences, text: text.slice(0, 2000) };
  // Negations and alternatives need confirmation, not guessed Boolean logic.
  if (/말고|제외|아닌|않|싫|또는|아니면|\bor\b|\bnot\b/i.test(text))
    return {
      value,
      notice:
        '부정 표현이나 선택 조건은 자동으로 적용하지 않았습니다. 아래 조건을 직접 선택해 주세요.',
    };
  value.remote = /원격|재택|remote/i.test(text);
  // "North Korea" must never turn on the South Korea eligibility filter.
  value.korea = /한국|대한민국|남한|korea/i.test(text.replace(/north[\s-]+korea|dprk/gi, ''));
  const cities = [
    ['서울', 'Seoul'],
    ['부산', 'Busan'],
    ['인천', 'Incheon'],
    ['도쿄', 'Tokyo'],
    ['런던', 'London'],
    ['뉴욕', 'New York'],
  ];
  value.location =
    cities.find(
      ([ko, en]) => text.includes(ko) || text.toLowerCase().includes(en.toLowerCase()),
    )?.[1] ?? '';
  value.contract = /프리랜서|freelanc/i.test(text)
    ? '프리랜서'
    : /계약직/i.test(text)
      ? '계약직'
      : /정규직/i.test(text)
        ? '정규직'
        : /파트타임|part.time/i.test(text)
          ? '파트타임'
          : '';
  value.maxWeeklyHours =
    text.match(/(?:주당|주)\s*(\d+(?:\.\d+)?)\s*시간\s*(?:이하|이내|미만)/)?.[1] ??
    text.match(
      /(?:up to|at most|no more than)\s*(\d+(?:\.\d+)?)\s*hours?\s*(?:per|a|\/)\s*week/i,
    )?.[1] ??
    '';
  return {
    value,
    notice:
      '기본 표현만 해석했습니다. 아래 선택된 조건만 검색에 적용됩니다. 보수·시간대·복잡한 조건은 자동 해석하지 않으므로 기존 필터와 원문도 확인해 주세요.',
  };
}
export function validatePreferences(input: unknown): Preferences {
  const v = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  return {
    text: typeof v.text === 'string' ? v.text.slice(0, 2000) : '',
    remote: v.remote === true,
    korea: v.korea === true,
    location: typeof v.location === 'string' ? v.location.trim().slice(0, 100) : '',
    contract: ['프리랜서', '계약직', '정규직', '파트타임'].includes(String(v.contract))
      ? String(v.contract)
      : '',
    maxWeeklyHours:
      typeof v.maxWeeklyHours === 'string' &&
      /^\d+(\.\d+)?$/.test(v.maxWeeklyHours) &&
      Number(v.maxWeeklyHours) <= 168
        ? v.maxWeeklyHours
        : '',
  };
}
export function matchesPreferences(job: Job, p?: Preferences): boolean {
  if (!p) return true;
  if (p.remote && job.workMode !== '원격') return false;
  if (p.korea && job.korea !== 'confirmed') return false;
  if (p.location) {
    const aliases: Record<string, string[]> = {
      Seoul: ['Seoul', '서울'],
      Busan: ['Busan', '부산'],
      Incheon: ['Incheon', '인천'],
      Tokyo: ['Tokyo', '도쿄'],
      London: ['London', '런던'],
      'New York': ['New York', '뉴욕'],
    };
    const terms = Object.entries(aliases).find(([city, names]) =>
      [city, ...names].some((n) => n.toLowerCase() === p.location.toLowerCase()),
    )?.[1] ?? [p.location];
    if (!terms.some((n) => job.location.toLowerCase().includes(n.toLowerCase()))) return false;
    if (/^(?:korea|south korea|한국|대한민국)$/i.test(p.location) && job.korea !== 'confirmed')
      return false;
  }
  if (p.contract && job.contract !== p.contract) return false;
  if (p.maxWeeklyHours) {
    const line = job.hours ?? '';
    const range = line.match(
      /(\d+(?:\.\d+)?)\s*(?:hours?\s*)?(?:-|–|to)\s*(\d+(?:\.\d+)?)\s*hours?\s*(?:per|a|\/)\s*week/i,
    );
    const exact = line.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*hours?\s*(?:per|a|\/)\s*week/i);
    const upper = range ? Number(range[2]) : exact ? Number(exact[1]) : null;
    if (
      upper === null ||
      /minimum|at least|최소|\d\s*\+/.test(line) ||
      upper > Number(p.maxWeeklyHours)
    )
      return false;
  }
  return true;
}
