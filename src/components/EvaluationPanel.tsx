import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import type { Job } from '../domain';
import type {
  Evaluation,
  EvaluationInput,
  EvaluationReport,
  KoreaJudgment,
  LanguageJudgment,
  RelevanceJudgment,
  SalaryJudgment,
} from '../../server/evaluation';

type EvaluationList = { items: Evaluation[]; report: EvaluationReport };

function fraction(numerator: number, denominator: number): string {
  return denominator
    ? `${numerator}/${denominator} (${Math.round((numerator * 100) / denominator)}%)`
    : '비교 가능한 평가 없음 (0건)';
}

export default function EvaluationPanel({ jobs }: { jobs: Job[] }) {
  const [items, setItems] = useState<Evaluation[]>([]);
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [relevance, setRelevance] = useState<RelevanceJudgment>('uncertain');
  const [korea, setKorea] = useState<KoreaJudgment>('unknown');
  const [salary, setSalary] = useState<SalaryJudgment>('unknown');
  const [language, setLanguage] = useState<LanguageJudgment>('unknown');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [includeNotes, setIncludeNotes] = useState(false);

  const choices = useMemo(() => {
    const available = jobs.map((job) => ({ id: job.id, label: `${job.title} · ${job.company}` }));
    const seen = new Set(available.map((job) => job.id));
    return available.concat(
      items
        .filter((item) => !seen.has(item.jobId))
        .map((item) => ({
          id: item.jobId,
          label: `${item.title} · ${item.company} (이전 검색에서 평가함)`,
        })),
    );
  }, [jobs, items]);

  useEffect(() => {
    let active = true;
    void api<EvaluationList>('evaluations')
      .then((data) => {
        if (!active) return;
        setItems(data.items);
        setReport(data.report);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : '평가를 불러오지 못했습니다.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setSelectedJobId((old) =>
      choices.some((choice) => choice.id === old) ? old : (choices[0]?.id ?? ''),
    );
  }, [choices]);

  useEffect(() => {
    const existing = items.find((item) => item.jobId === selectedJobId);
    setRelevance(existing?.relevance ?? 'uncertain');
    setKorea(existing?.korea ?? 'unknown');
    setSalary(existing?.salary ?? 'unknown');
    setLanguage(existing?.language ?? 'unknown');
    setNotes(existing?.notes ?? '');
  }, [selectedJobId, items]);

  async function refresh() {
    const data = await api<EvaluationList>('evaluations');
    setItems(data.items);
    setReport(data.report);
  }

  async function save() {
    if (!selectedJobId || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const payload: EvaluationInput = {
        jobId: selectedJobId,
        relevance,
        korea,
        salary,
        language,
        notes,
      };
      await api('evaluations', 'PUT', payload);
      await refresh();
      setNotice('내 평가가 저장되었습니다.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '평가를 저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(jobId: string) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await api('evaluations', 'DELETE', { jobId });
      await refresh();
      setNotice('내 평가가 삭제되었습니다.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '평가를 삭제하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function exportReviews(format: 'csv' | 'json') {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const query = new URLSearchParams({ format });
      if (includeNotes) query.set('includeNotes', '1');
      const response = await fetch(`/api/evaluations/export?${query.toString()}`, {
        credentials: 'same-origin',
      });
      if (!response.ok) {
        const value = (await response.json()) as { error?: string };
        throw new Error(value.error ?? '내보내기에 실패했습니다.');
      }
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = `rolescout-my-evaluations.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '내보내기에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  const selected = items.find((item) => item.jobId === selectedJobId);
  const live = jobs.find((job) => job.id === selectedJobId);
  const compensation = selected?.salarySnapshot ?? live?.compensation;

  return (
    <section className="panel evaluation-panel" aria-labelledby="evaluation-title">
      <h2 id="evaluation-title">내 공고 품질 평가</h2>
      <p className="muted">
        이 기능은 본인이 살펴본 공고에 대한 개인 판단을 저장합니다. 회사·플랫폼의 검증 결과나 모든
        지원자에게 적용되는 정답이 아닙니다. 평가에 사용된 점수·버전을 당시 기준으로 남깁니다.
      </p>
      {loading && <p role="status">내 평가를 불러오는 중입니다…</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      {report && (
        <div className="evaluation-report" aria-label="개인 평가 집계">
          <p>
            <strong>평가한 공고:</strong> {report.total}건 · 관련 있음 {report.relevance.yes}건 /
            관련 없음 {report.relevance.no}건 / 판단 보류 {report.relevance.uncertain}건
          </p>
          <p>
            <strong>관련성 판단과 점수 일치:</strong>{' '}
            {fraction(report.relevance.agreement, report.relevance.comparisonDenominator)}. 분모:
            관련성에 예/아니요로 응답하고 점수가 기록된 공고. 점수 45점 이상을 시스템의 관련 있음
            표시로 간주합니다.
          </p>
          <p>
            <strong>관련 있음으로 표시했으나 개인적으로 관련 없다고 판단:</strong>{' '}
            {fraction(
              report.relevance.falsePositive,
              report.relevance.predictedRelevantDenominator,
            )}
            . 분모: 45점 이상이며 예/아니요로 평가한 공고. 실제 분류 오류가 확정된 비율은 아닙니다.
          </p>
          <p>
            <strong>한국 근무 판단 일치:</strong>{' '}
            {fraction(report.korea.agreement, report.korea.comparisonDenominator)}. 분모: 시스템과
            본인의 판단이 모두 확정적인 공고. 비교 불가·미확인 {report.korea.unknownOrUncomparable}
            건.
          </p>
          <p>
            <strong>보수 추출이 맞다고 평가:</strong>{' '}
            {fraction(report.salary.correct, report.salary.assessedDenominator)}. 분모:
            맞음/틀림으로 직접 판단한 {report.salary.assessedDenominator}건. 미확인{' '}
            {report.salary.unknown}건.
          </p>
          <p>
            <strong>언어 조건이 맞다고 평가:</strong>{' '}
            {fraction(report.language.correct, report.language.assessedDenominator)}. 분모:
            맞음/틀림으로 직접 판단한 {report.language.assessedDenominator}건. 미확인{' '}
            {report.language.unknown}건.
          </p>
          {report.smallSample && (
            <p className="status-warning">
              관련성 비교 표본이 20건 미만입니다. 수치가 전체 공고나 다른 사용자에게 일반화되지
              않습니다.
            </p>
          )}
        </div>
      )}

      <div className="evaluation-editor">
        <label htmlFor="evaluation-job">평가할 공고</label>
        <select
          id="evaluation-job"
          value={selectedJobId}
          disabled={busy || loading || !choices.length}
          onChange={(event) => setSelectedJobId(event.target.value)}
        >
          {!choices.length && <option value="">검색한 공고가 없습니다</option>}
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.label}
            </option>
          ))}
        </select>
        {selectedJobId && (
          <>
            <p className="muted">
              기록 기준:{' '}
              {selected
                ? `${selected.score ?? '점수 미기록'}점 · ${selected.scoreVersion}`
                : `${live?.matchScore ?? '점수 미기록'}점 · ${live?.scoreVersion ?? 'legacy'}`}
              {' · '}한국 근무: {selected?.predictedKorea ?? live?.korea ?? 'unknown'}
              {' · '}언어 근거:{' '}
              {selected?.languageEvidence ||
                live?.matchedEvidence
                  ?.filter((evidence) => evidence.startsWith('언어 표현:'))
                  .join(', ') ||
                '미확인'}
            </p>
            <p className="muted">
              보수 추출: {compensation?.min ?? '하한 미확인'} ~ {compensation?.max ?? '상한 미확인'}
              {' · '}
              {compensation?.currency ?? '통화 미확인'} · {compensation?.unit ?? '지급 단위 미확인'}
              .
              {live && (
                <>
                  {' '}
                  <a href={live.url} target="_blank" rel="noopener noreferrer">
                    공고 원문에서 확인 ↗
                  </a>
                </>
              )}
            </p>
            <div className="evaluation-fields">
              <label>
                내게 관련 있는 공고인가요?
                <select
                  value={relevance}
                  disabled={busy}
                  onChange={(event) => setRelevance(event.target.value as RelevanceJudgment)}
                >
                  <option value="uncertain">판단 보류</option>
                  <option value="yes">예</option>
                  <option value="no">아니요</option>
                </select>
              </label>
              <label>
                대한민국에서 근무·계약 가능 여부
                <select
                  value={korea}
                  disabled={busy}
                  onChange={(event) => setKorea(event.target.value as KoreaJudgment)}
                >
                  <option value="unknown">미확인</option>
                  <option value="yes">가능하다고 확인</option>
                  <option value="no">불가능하다고 확인</option>
                </select>
              </label>
              <label>
                보수 추출·단위가 원문과 일치하나요?
                <select
                  value={salary}
                  disabled={busy}
                  onChange={(event) => setSalary(event.target.value as SalaryJudgment)}
                >
                  <option value="unknown">미확인</option>
                  <option value="correct">맞음</option>
                  <option value="wrong">틀림</option>
                </select>
              </label>
              <label>
                언어 요건 판단이 맞나요?
                <select
                  value={language}
                  disabled={busy}
                  onChange={(event) => setLanguage(event.target.value as LanguageJudgment)}
                >
                  <option value="unknown">미확인</option>
                  <option value="correct">맞음</option>
                  <option value="wrong">틀림</option>
                </select>
              </label>
            </div>
            <label htmlFor="evaluation-notes">
              개인 검토 메모 (선택, 최대 1,000자)
              <textarea
                id="evaluation-notes"
                rows={3}
                maxLength={1000}
                value={notes}
                disabled={busy}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="검토한 근거를 간단히 남겨 주세요. 민감한 개인정보는 입력하지 마세요."
              />
            </label>
            <div className="actions evaluation-actions">
              <button className="primary" disabled={busy || loading} onClick={() => void save()}>
                {selected ? '내 평가 수정·저장' : '내 평가 저장'}
              </button>
              {selected && (
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() => void remove(selected.jobId)}
                >
                  이 평가 삭제
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <details className="evaluation-history">
        <summary>저장한 내 평가 {items.length}건 보기</summary>
        {items.length === 0 ? (
          <p className="muted">작성한 평가가 없습니다.</p>
        ) : (
          <ul>
            {items.map((item) => (
              <li key={item.jobId}>
                <span>
                  <strong>{item.title}</strong> · {item.company} · 관련성{' '}
                  {item.relevance === 'yes' ? '예' : item.relevance === 'no' ? '아니요' : '보류'} ·
                  최종 수정 {new Date(item.updatedAt).toLocaleString('ko-KR')}
                </span>
                <button disabled={busy} onClick={() => setSelectedJobId(item.jobId)}>
                  편집
                </button>
                <button className="danger" disabled={busy} onClick={() => void remove(item.jobId)}>
                  삭제
                </button>
              </li>
            ))}
          </ul>
        )}
      </details>

      <div className="evaluation-export">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={includeNotes}
            disabled={busy}
            onChange={(event) => setIncludeNotes(event.target.checked)}
          />
          내보낸 파일에 개인 메모 포함 (기본 제외)
        </label>
        <div className="actions evaluation-actions">
          <button disabled={busy || !items.length} onClick={() => void exportReviews('csv')}>
            내 평가 CSV 저장
          </button>
          <button disabled={busy || !items.length} onClick={() => void exportReviews('json')}>
            내 평가 JSON 저장
          </button>
        </div>
        <p className="muted">
          내보내기에는 계정 식별자·이력서·공고 전체 설명이 포함되지 않습니다. 개인 메모는 선택한
          경우에만 포함합니다.
        </p>
      </div>
    </section>
  );
}
