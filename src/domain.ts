export const units = {
  hour: '시급',
  day: '일급',
  week: '주급',
  month: '월급',
  year: '연봉',
  project: '프로젝트당',
  task: '건당',
  audio_hour: '음성 1시간당',
  audio_minute: '음성 1분당',
} as const;

export type Compensation = {
  min: number | null;
  max: number | null;
  currency: string | null;
  unit: keyof typeof units | null;
  note: string;
};
export type Profile = {
  skills: string[];
  languages: string[];
  experience: string[];
  education: string[];
  keywords: string[];
  mode: 'local' | 'ai';
  updatedAt?: string;
  linkedinUrl?: string;
  preferences?: import('./preferences').Preferences;
  primaryRoleKeywords?: string[];
  skillKeywords?: string[];
  languageKeywords?: string[];
  negativeKeywords?: string[];
};
export type Job = {
  id: string;
  title: string;
  company: string;
  description: string;
  location: string;
  contract: string;
  compensation: Compensation;
  workMode: string;
  korea: 'confirmed' | 'excluded' | 'unknown';
  koreaEvidence: string;
  hours: string | null;
  source: string;
  sourceUrl: string;
  url: string;
  postedAt: string | null;
  fetchedAt: string;
  checkedAt: string;
  status: 'open' | 'unknown' | 'closed';
  kind: string;
  match: string[];
  sourceStatus: string;
  platform: string | null;
  safetySignals?: string[];
  matchScore?: number;
  matchScoreLabel?: 'high' | 'medium' | 'low';
  scoreExplanation?: string;
  matchedEvidence?: string[];
  missingEvidence?: string[];
  scoreVersion?: string;
  scoreBasis?: 'rules' | 'ai';
  scoreBreakdown?: {
    role: number;
    skills: number;
    language: number;
    experience: number;
    workCondition: number;
  };
};
export type SourceResult = {
  source: string;
  count: number;
  error?: string;
  cached: boolean;
  checkedAt: string | null;
};
export type SearchResult = {
  jobs: Job[];
  sources: SourceResult[];
  searchedAt: string;
  keywords: string[];
  preferences?: import('./preferences').Preferences;
  newJobIds?: string[];
  previousSearchedAt?: string | null;
};
export type Filters = {
  query: string;
  contract: string;
  unit: string;
  currency: string;
  minimum: string;
  includeUnknown: boolean;
  workMode: string;
  korea: string;
  days: string;
  sort: string;
};
export const defaultFilters: Filters = {
  query: '',
  contract: '',
  unit: '',
  currency: '',
  minimum: '',
  includeUnknown: true,
  workMode: '',
  korea: '',
  days: '',
  sort: 'match',
};

export function filterJobs(jobs: Job[], f: Filters, now = Date.now()): Job[] {
  const comparable = !!f.currency && !!f.unit;
  const validMinimum =
    f.minimum !== '' && Number.isFinite(Number(f.minimum)) && Number(f.minimum) >= 0;
  return jobs
    .filter((j) => {
      const c = j.compensation;
      const unknownAmount = c.min === null && c.max === null;
      if (
        f.query &&
        !`${j.title} ${j.company} ${j.description}`.toLowerCase().includes(f.query.toLowerCase())
      )
        return false;
      if (f.contract && j.contract !== f.contract) return false;
      if (f.workMode && j.workMode !== f.workMode) return false;
      if (f.korea && j.korea !== f.korea) return false;
      // Preserve unknown amounts on request, but never mix *known* mismatching units/currencies.
      if (f.unit && c.unit && c.unit !== f.unit) return false;
      if (f.currency && c.currency && c.currency !== f.currency) return false;
      if (unknownAmount) {
        if (!f.includeUnknown) return false;
      } else if ((f.unit && c.unit !== f.unit) || (f.currency && c.currency !== f.currency)) {
        return false;
      } else if (comparable && validMinimum && (c.min === null || c.min < Number(f.minimum))) {
        // An upper bound is not a known minimum.
        return false;
      }
      if (f.days && (!j.postedAt || Date.parse(j.postedAt) < now - Number(f.days) * 86400000))
        return false;
      return true;
    })
    .sort((a, b) => {
      const newest = (Date.parse(b.postedAt ?? '') || 0) - (Date.parse(a.postedAt ?? '') || 0);
      if (f.sort === 'newest') return newest || a.id.localeCompare(b.id);
      if (f.sort === 'pay' && comparable) {
        return (
          (b.compensation.min ?? -1) - (a.compensation.min ?? -1) ||
          newest ||
          a.id.localeCompare(b.id)
        );
      }
      // Search and saved views use the same explainable score ordering.
      const score = (b.matchScore ?? -1) - (a.matchScore ?? -1);
      return score || newest || b.match.length - a.match.length || a.id.localeCompare(b.id);
    });
}
