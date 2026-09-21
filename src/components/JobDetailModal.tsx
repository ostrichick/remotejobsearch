import { useEffect, useRef } from 'react';
import type { Job } from '../domain';
import type { Trust } from '../api';

const date = (s: string | null) => (s ? new Date(s).toLocaleString('ko-KR') : '미기재');
const scoreLabels = { high: '높음', medium: '보통', low: '낮음' };

function TrustDetails({ item }: { item: Trust }) {
  const checkedAt = Date.parse(item.checkedAt);
  const stale = !Number.isFinite(checkedAt) || Date.now() - checkedAt > 30 * 86400000;
  return (
    <>
      <p>
        {item.name} · 확인 {item.checkedAt}
      </p>
      {stale && (
        <p role="status" className="status-warning">
          이 플랫폼의 검토 자료가 30일 이상 지났거나 확인일이 불명확합니다. 아래 공식 링크에서 현재
          지급·계약 조건을 다시 확인하세요.
        </p>
      )}
      <p>{item.summary}</p>
      <p>{item.operator}</p>
      <h4>공식 정책</h4>
      <p>{item.policy}</p>
      <h4>외부 이용자 주장</h4>
      <p>{item.experience}</p>
      <ul>
        {item.links.map((l) => (
          <li key={l.url}>
            <a href={l.url} target="_blank" rel="noopener noreferrer">
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function JobDetailModal({
  job: detail,
  trust,
  onClose,
}: {
  job: Job | null;
  trust: Record<string, Trust>;
  onClose: () => void;
}) {
  if (!detail) return null;
  return <Modal detail={detail} trust={trust} onClose={onClose} />;
}

function Modal({
  detail,
  trust,
  onClose,
}: {
  detail: Job;
  trust: Record<string, Trust>;
  onClose: () => void;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    closeButton.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [onClose]);

  return (
    <div className="overlay" onClick={onClose}>
      <section
        className="detail"
        role="dialog"
        aria-modal="true"
        aria-label="공고 상세"
        onClick={(e) => e.stopPropagation()}
      >
        <button ref={closeButton} onClick={onClose}>
          닫기
        </button>
        <h2>{detail.title}</h2>
        <p>
          {detail.company} · {detail.kind}
        </p>
        <h3>
          이력서 매치 점수:{' '}
          {detail.matchScore === undefined ? '미산정' : `${detail.matchScore}/100`} (
          {detail.matchScoreLabel ? scoreLabels[detail.matchScoreLabel] : '등급 미산정'})
        </h3>
        <p>
          이 점수는 이력서에 명시된 정보와 공고 원문의 일치 정도를 계산한 참고 지표이며, 합격
          가능성을 예측하지 않습니다.
        </p>
        <p>
          {detail.scoreExplanation ?? '기존 검색 결과에는 점수 근거가 없습니다.'} · 기준{' '}
          {detail.scoreVersion ?? 'legacy'} · {detail.scoreBasis === 'ai' ? 'AI' : '규칙 기반'}
        </p>
        <ul>
          {(detail.matchedEvidence ?? []).map((x) => (
            <li key={x}>일치: {x}</li>
          ))}
          {(detail.missingEvidence ?? []).map((x) => (
            <li key={x}>미확인: {x}</li>
          ))}
        </ul>
        <p>{detail.sourceStatus}</p>
        <h3>한국 근무·계약 조건</h3>
        <p>{detail.koreaEvidence}</p>
        <p className="muted">
          한국 근무지 또는 한국 거주 조건이 명시되어 있어도 국적·체류 자격·채용 가능 여부를 확인한
          것은 아닙니다. 원문과 채용 담당자의 안내를 별도로 확인하세요.
        </p>
        {!!detail.safetySignals?.length && (
          <section className="safety-signals" aria-label="추가 확인할 조건">
            <h3>지원 전 확인할 조건</h3>
            <p>
              공고 문구에서 확인이 필요한 표현을 찾았습니다. 아래 항목은 자동 탐지된 원문 근거이며,
              기업이나 공고가 사기라고 판정한 것은 아닙니다.
            </p>
            <ul>
              {detail.safetySignals.map((signal, index) => (
                <li key={`${index}:${signal}`}>{signal}</li>
              ))}
            </ul>
          </section>
        )}
        <p>보수 원문: {detail.compensation.note || '보수 미기재'}</p>
        <p>
          조회 당시{' '}
          {detail.status === 'open'
            ? '공개 모집 목록에 존재'
            : detail.status === 'closed'
              ? '마감 표시'
              : '상태 미확인'}{' '}
          · 마지막 확인 {date(detail.checkedAt)}
        </p>
        <a href={detail.url} target="_blank" rel="noopener noreferrer">
          연결된 공고·지원 페이지에서 현재 상태 확인 ↗
        </a>
        <h3>업무 / 자격 원문</h3>
        <p className="description">{detail.description}</p>
        <h3>플랫폼 / 지급 검토</h3>
        {detail.platform && trust[detail.platform] ? (
          <TrustDetails item={trust[detail.platform]} />
        ) : (
          <p>
            개별 회사의 지급·계약 이력은 미검증입니다. ATS 원문 조회가 지급 보증을 뜻하지 않습니다.
          </p>
        )}
      </section>
    </div>
  );
}
