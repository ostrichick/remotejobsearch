import { useEffect } from 'react';
import type { Job } from '../domain';
import type { Trust } from '../api';

const date = (s: string | null) => (s ? new Date(s).toLocaleString('ko-KR') : '미기재');

function TrustDetails({ item }: { item: Trust }) {
  return (
    <>
      <p>
        {item.name} · 확인 {item.checkedAt}
      </p>
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
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
        <button autoFocus onClick={onClose}>
          닫기
        </button>
        <h2>{detail.title}</h2>
        <p>
          {detail.company} · {detail.kind}
        </p>
        <h3>
          이력서 매치 적합도: {detail.matchScore ?? 0}% ({detail.matchScoreLabel ?? 'unknown'})
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
        <p>{detail.koreaEvidence}</p>
        <p>보수 원문: {detail.compensation.note || '보수 미기재'}</p>
        <p>
          조회 당시 {detail.status === 'open' ? '공개 모집 목록에 존재' : '상태 미확인'} · 마지막
          확인 {date(detail.checkedAt)}
        </p>
        <a href={detail.url} target="_blank" rel="noopener noreferrer">
          원문에서 현재 상태 확인 ↗
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
