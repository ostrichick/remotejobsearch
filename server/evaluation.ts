import type { Job, SearchResult } from '../src/domain';

export type RelevanceJudgment = 'yes' | 'no' | 'uncertain';
export type KoreaJudgment = 'yes' | 'no' | 'unknown';
export type SalaryJudgment = 'correct' | 'wrong' | 'unknown';
export type LanguageJudgment = 'correct' | 'wrong' | 'unknown';

export interface EvaluationInput {
  jobId: string;
  relevance: RelevanceJudgment;
  korea: KoreaJudgment;
  salary: SalaryJudgment;
  language: LanguageJudgment;
  notes: string;
}

/** Returned to the signed-in owner only. No user ID or full job/resume text. */
export interface Evaluation extends EvaluationInput {
  title: string;
  company: string;
  source: string;
  score: number | null;
  scoreVersion: string;
  predictedKorea: 'confirmed' | 'excluded' | 'unknown';
  languageEvidence: string;
  salarySnapshot: {
    min: number | null;
    max: number | null;
    currency: string | null;
    unit: string | null;
  };
  searchedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface EvaluationReport {
  total: number;
  relevance: {
    yes: number;
    no: number;
    uncertain: number;
    comparisonDenominator: number;
    agreement: number;
    predictedRelevantDenominator: number;
    falsePositive: number;
  };
  korea: { comparisonDenominator: number; agreement: number; unknownOrUncomparable: number };
  salary: { assessedDenominator: number; correct: number; wrong: number; unknown: number };
  language: { assessedDenominator: number; correct: number; wrong: number; unknown: number };
  smallSample: boolean;
}

type EvaluationRow = {
  job_id: string;
  relevance: RelevanceJudgment;
  korea: KoreaJudgment;
  salary: SalaryJudgment;
  language: LanguageJudgment;
  notes: string;
  title: string;
  company: string;
  source: string;
  score: number | null;
  score_version: string;
  predicted_korea: Evaluation['predictedKorea'];
  language_evidence: string;
  salary_snapshot: string;
  searched_at: string;
  created_at: string;
  updated_at: string;
};

export class EvaluationError extends Error {
  constructor(
    message: string,
    public readonly status: 400 | 404 | 413 | 422 = 422,
  ) {
    super(message);
  }
}

export function validateEvaluation(value: Record<string, unknown>): EvaluationInput {
  const allowed = new Set(['jobId', 'relevance', 'korea', 'salary', 'language', 'notes']);
  if (Object.keys(value).some((key) => !allowed.has(key)))
    throw new EvaluationError('평가 항목 외의 값은 입력할 수 없습니다.');
  const { jobId, relevance, korea, salary, language, notes = '' } = value;
  if (typeof jobId !== 'string' || !jobId.trim() || jobId.length > 200 || jobId !== jobId.trim())
    throw new EvaluationError('공고 식별자가 올바르지 않습니다.');
  if (typeof relevance !== 'string' || !['yes', 'no', 'uncertain'].includes(relevance))
    throw new EvaluationError('관련성 평가를 선택해 주세요.');
  if (typeof korea !== 'string' || !['yes', 'no', 'unknown'].includes(korea))
    throw new EvaluationError('한국 근무 가능 여부 평가를 선택해 주세요.');
  if (typeof salary !== 'string' || !['correct', 'wrong', 'unknown'].includes(salary))
    throw new EvaluationError('보수 정보 평가를 선택해 주세요.');
  if (typeof language !== 'string' || !['correct', 'wrong', 'unknown'].includes(language))
    throw new EvaluationError('언어 정보 평가를 선택해 주세요.');
  if (
    typeof notes !== 'string' ||
    notes.length > 1000 ||
    [...notes].some((character) => {
      const code = character.charCodeAt(0);
      return (code < 32 && ![9, 10, 13].includes(code)) || code === 127;
    })
  )
    throw new EvaluationError('메모는 1,000자 이하의 일반 텍스트로 작성해 주세요.');
  return {
    jobId,
    relevance: relevance as RelevanceJudgment,
    korea: korea as KoreaJudgment,
    salary: salary as SalaryJudgment,
    language: language as LanguageJudgment,
    notes: notes.trim(),
  };
}

export function validateEvaluationId(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 200 || value !== value.trim())
    throw new EvaluationError('공고 식별자가 올바르지 않습니다.');
  return value;
}

function safeText(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.slice(0, limit) : '';
}

function snapshot(job: Job, searchedAt: string) {
  const c = job.compensation;
  const amount = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  return {
    title: safeText(job.title, 200),
    company: safeText(job.company, 150),
    source: safeText(job.source, 150),
    score:
      typeof job.matchScore === 'number' &&
      Number.isFinite(job.matchScore) &&
      job.matchScore >= 0 &&
      job.matchScore <= 100
        ? Math.round(job.matchScore)
        : null,
    scoreVersion: safeText(job.scoreVersion, 80) || 'legacy',
    predictedKorea: job.korea === 'confirmed' || job.korea === 'excluded' ? job.korea : 'unknown',
    languageEvidence: (job.matchedEvidence ?? [])
      .filter((text) => text.startsWith('언어 표현:'))
      .join(', ')
      .slice(0, 250),
    salarySnapshot: JSON.stringify({
      min: amount(c?.min),
      max: amount(c?.max),
      currency: safeText(c?.currency, 20) || null,
      unit: safeText(c?.unit, 30) || null,
    }),
    searchedAt: safeText(searchedAt, 40),
  };
}

function rowToEvaluation(row: EvaluationRow): Evaluation {
  return {
    jobId: row.job_id,
    relevance: row.relevance,
    korea: row.korea,
    salary: row.salary,
    language: row.language,
    notes: row.notes,
    title: row.title,
    company: row.company,
    source: row.source,
    score: row.score,
    scoreVersion: row.score_version,
    predictedKorea: row.predicted_korea,
    languageEvidence: row.language_evidence,
    salarySnapshot: JSON.parse(row.salary_snapshot) as Evaluation['salarySnapshot'],
    searchedAt: row.searched_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listEvaluations(db: D1Database, uid: string): Promise<Evaluation[]> {
  const rows = await db
    .prepare(
      `SELECT job_id,relevance,korea,salary,language,notes,title,company,source,
    score,score_version,predicted_korea,language_evidence,salary_snapshot,searched_at,created_at,updated_at
    FROM job_evaluations WHERE user_id=? ORDER BY updated_at DESC,job_id ASC`,
    )
    .bind(uid)
    .all<EvaluationRow>();
  return rows.results.map(rowToEvaluation);
}

export async function saveEvaluation(
  db: D1Database,
  uid: string,
  input: EvaluationInput,
): Promise<Evaluation> {
  const existing = await db
    .prepare('SELECT job_id FROM job_evaluations WHERE user_id=? AND job_id=?')
    .bind(uid, input.jobId)
    .first<{ job_id: string }>();
  if (existing) {
    await db
      .prepare(
        `UPDATE job_evaluations SET relevance=?,korea=?,salary=?,language=?,notes=?,updated_at=?
      WHERE user_id=? AND job_id=?`,
      )
      .bind(
        input.relevance,
        input.korea,
        input.salary,
        input.language,
        input.notes,
        new Date().toISOString(),
        uid,
        input.jobId,
      )
      .run();
    const updated = await db
      .prepare(
        `SELECT job_id,relevance,korea,salary,language,notes,title,company,source,
      score,score_version,predicted_korea,language_evidence,salary_snapshot,searched_at,created_at,updated_at
      FROM job_evaluations WHERE user_id=? AND job_id=?`,
      )
      .bind(uid, input.jobId)
      .first<EvaluationRow>();
    if (!updated) throw new EvaluationError('수정할 평가를 찾을 수 없습니다.', 404);
    return rowToEvaluation(updated);
  }
  // A client may only evaluate a job returned in its own currently persisted search snapshot.
  // Existing owner reviews may be edited after a new search, but new reviews require its snapshot.
  const row = await db
    .prepare('SELECT data FROM searches WHERE user_id=?')
    .bind(uid)
    .first<{ data: string }>();
  const result = row ? (JSON.parse(row.data) as SearchResult) : null;
  const job = Array.isArray(result?.jobs)
    ? result.jobs.find((candidate) => candidate?.id === input.jobId)
    : undefined;
  if (!job) throw new EvaluationError('본인의 저장된 검색 결과에 없는 공고입니다.', 404);
  const metadata = snapshot(job, result?.searchedAt ?? '');
  const now = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO job_evaluations
    (user_id,job_id,relevance,korea,salary,language,notes,title,company,source,score,score_version,
     predicted_korea,language_evidence,salary_snapshot,searched_at,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(user_id,job_id) DO UPDATE SET
      relevance=excluded.relevance,korea=excluded.korea,salary=excluded.salary,language=excluded.language,
      notes=excluded.notes,updated_at=excluded.updated_at`,
    )
    .bind(
      uid,
      input.jobId,
      input.relevance,
      input.korea,
      input.salary,
      input.language,
      input.notes,
      metadata.title,
      metadata.company,
      metadata.source,
      metadata.score,
      metadata.scoreVersion,
      metadata.predictedKorea,
      metadata.languageEvidence,
      metadata.salarySnapshot,
      metadata.searchedAt,
      now,
      now,
    )
    .run();
  const saved = await db
    .prepare(
      `SELECT job_id,relevance,korea,salary,language,notes,title,company,source,
    score,score_version,predicted_korea,language_evidence,salary_snapshot,searched_at,created_at,updated_at
    FROM job_evaluations WHERE user_id=? AND job_id=?`,
    )
    .bind(uid, input.jobId)
    .first<EvaluationRow>();
  if (!saved) throw new Error('평가 저장 결과를 읽지 못했습니다.');
  return rowToEvaluation(saved);
}

export async function deleteEvaluation(db: D1Database, uid: string, jobId: string): Promise<void> {
  await db
    .prepare('DELETE FROM job_evaluations WHERE user_id=? AND job_id=?')
    .bind(uid, jobId)
    .run();
}

export function evaluationReport(items: Evaluation[]): EvaluationReport {
  const relevance = {
    yes: 0,
    no: 0,
    uncertain: 0,
    comparisonDenominator: 0,
    agreement: 0,
    predictedRelevantDenominator: 0,
    falsePositive: 0,
  };
  const korea = { comparisonDenominator: 0, agreement: 0, unknownOrUncomparable: 0 };
  const salary = { assessedDenominator: 0, correct: 0, wrong: 0, unknown: 0 };
  const language = { assessedDenominator: 0, correct: 0, wrong: 0, unknown: 0 };
  for (const item of items) {
    relevance[item.relevance]++;
    if (item.score !== null && item.relevance !== 'uncertain') {
      relevance.comparisonDenominator++;
      const predictedRelevant = item.score >= 45; // high/medium vs low, recorded score version.
      if (
        (predictedRelevant && item.relevance === 'yes') ||
        (!predictedRelevant && item.relevance === 'no')
      )
        relevance.agreement++;
      if (predictedRelevant) {
        relevance.predictedRelevantDenominator++;
        if (item.relevance === 'no') relevance.falsePositive++;
      }
    }
    if (item.korea !== 'unknown' && item.predictedKorea !== 'unknown') {
      korea.comparisonDenominator++;
      if (
        (item.korea === 'yes' && item.predictedKorea === 'confirmed') ||
        (item.korea === 'no' && item.predictedKorea === 'excluded')
      )
        korea.agreement++;
    } else korea.unknownOrUncomparable++;
    salary[item.salary]++;
    if (item.salary !== 'unknown') salary.assessedDenominator++;
    language[item.language]++;
    if (item.language !== 'unknown') language.assessedDenominator++;
  }
  return {
    total: items.length,
    relevance,
    korea,
    salary,
    language,
    smallSample: relevance.comparisonDenominator < 20,
  };
}

function csvCell(value: string | number | null): string {
  let text = value === null ? '' : String(value);
  // Formula injection can begin after leading whitespace/control characters in spreadsheet apps.
  let offset = 0;
  while (
    offset < text.length &&
    (text.charCodeAt(offset) <= 32 || text.charCodeAt(offset) === 127 || /\s/u.test(text[offset]))
  )
    offset++;
  if (offset < text.length && '=+@-'.includes(text[offset])) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

/** Export owner-only human judgments, never uid, email, job description, resume or hidden data. */
export function evaluationCsv(items: Evaluation[]): string {
  const columns = [
    'jobId',
    'title',
    'company',
    'source',
    'score',
    'scoreVersion',
    'predictedKorea',
    'salaryMin',
    'salaryMax',
    'salaryCurrency',
    'salaryUnit',
    'languageEvidence',
    'searchedAt',
    'relevance',
    'korea',
    'salary',
    'language',
    'notes',
    'createdAt',
    'updatedAt',
  ] as const;
  const rows = items.map((item) => ({
    jobId: item.jobId,
    title: item.title,
    company: item.company,
    source: item.source,
    score: item.score,
    scoreVersion: item.scoreVersion,
    predictedKorea: item.predictedKorea,
    salaryMin: item.salarySnapshot.min,
    salaryMax: item.salarySnapshot.max,
    salaryCurrency: item.salarySnapshot.currency,
    salaryUnit: item.salarySnapshot.unit,
    languageEvidence: item.languageEvidence,
    searchedAt: item.searchedAt,
    relevance: item.relevance,
    korea: item.korea,
    salary: item.salary,
    language: item.language,
    notes: item.notes,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }));
  return (
    '\uFEFF' +
    columns.join(',') +
    '\r\n' +
    rows.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\r\n') +
    '\r\n'
  );
}
