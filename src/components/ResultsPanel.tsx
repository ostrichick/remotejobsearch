import type { Filters, Job, SearchResult } from '../domain';
import { units } from '../domain';

const korea = {
  confirmed: '한국 근무지/거주 명시 · 채용 자격 별도 확인',
  excluded: '한국 제외 조건 명시',
  unknown: '한국에서 근무·계약 가능 여부 미확인',
};
const scoreLabels = { high: '높음', medium: '보통', low: '낮음' };
const date = (s: string | null) => (s ? new Date(s).toLocaleString('ko-KR') : '미기재');
const olderThan = (s: string | null, days: number) =>
  !!s && Number.isFinite(Date.parse(s)) && Date.now() - Date.parse(s) > days * 86400000;
const money = (j: Job) => {
  const c = j.compensation;
  if (c.min === null && c.max === null) return '—';
  const min = c.min?.toLocaleString() ?? '—';
  const max = c.max !== c.min ? ` – ${c.max?.toLocaleString() ?? '—'}` : '';
  return `${min}${max}`;
};

interface ResultsPanelProps {
  result: SearchResult | null;
  saved: Job[];
  savedOnly: boolean;
  newOnly: boolean;
  searchOutdated: boolean;
  showLow: boolean;
  filters: Filters;
  visible: Job[];
  allJobs: Job[];
  busy: boolean;
  onToggleSavedOnly: () => void;
  onNewOnly: (show: boolean) => void;
  onShowLow: (show: boolean) => void;
  onField: (key: keyof Filters, value: string | boolean) => void;
  onOpenDetail: (job: Job) => void;
  onSave: (job: Job) => void;
  onFindJobs: () => void;
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label>
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </label>
  );
}

export default function ResultsPanel({
  result,
  saved,
  savedOnly,
  newOnly,
  searchOutdated,
  showLow,
  filters,
  visible,
  allJobs,
  busy,
  onToggleSavedOnly,
  onNewOnly,
  onShowLow,
  onField,
  onOpenDetail,
  onSave,
  onFindJobs,
}: ResultsPanelProps) {
  const unique = (key: (j: Job) => string | null | undefined) => [
    ...new Set(allJobs.map((j) => key(j)).filter((v): v is string => !!v)),
  ];
  const uniqueContract = [...new Set(allJobs.map((j) => j.contract))];
  const uniqueCurrency = unique((j) => j.compensation.currency);
  const uniqueWorkMode = [...new Set(allJobs.map((j) => j.workMode))];
  const canComparePay = !!filters.currency && !!filters.unit;
  const failedSources = result?.sources.filter((s) => s.error) ?? [];
  const newIds = result?.newJobIds;

  return (
    <section className="panel">
      <div className="heading">
        <h2>
          {savedOnly ? '저장한 공고' : '검색 결과'} <span>{visible.length}</span>
        </h2>
        <div className="heading-actions">
          <button disabled={!!busy} onClick={onFindJobs}>
            다시 검색
          </button>
          <button onClick={onToggleSavedOnly}>
            {savedOnly ? '검색 결과 보기' : `저장한 공고 (${saved.length})`}
          </button>
        </div>
      </div>
      {result && (
        <>
          <p className="muted">
            검색: {date(result.searchedAt)} · 키워드: {result.keywords.join(', ')} · 최대 150건 표시
          </p>
          {searchOutdated && (
            <p className="status-warning" role="status">
              프로필이나 검색 조건이 변경되었습니다. 현재 결과와 매치 점수는 변경 전 기준입니다.
              다시 검색하면 수정된 프로필을 저장하고 결과를 갱신합니다.
            </p>
          )}
          {olderThan(result.searchedAt, 1) && (
            <p className="status-warning" role="status">
              마지막 검색 후 24시간이 지났습니다. 공고가 마감되었거나 조건이 바뀌었을 수 있으니 다시
              검색하고 원문을 확인하세요.
            </p>
          )}
          {failedSources.length > 0 && (
            <p className="status-warning" role="status">
              {result.sources.length}개 출처 중 {failedSources.length}개 조회에 실패해 일부 공고가
              누락될 수 있습니다. 이번 검색 결과가 전체 채용 현황을 나타내지는 않습니다.
            </p>
          )}
          {newIds !== undefined && result.previousSearchedAt && (
            <p className="notice" role="status">
              이전 검색({date(result.previousSearchedAt)}) 이후 이번 결과에서 처음 발견한 공고:{' '}
              {newIds.length}건. 실제 게시일이나 채용 시작일을 뜻하지 않습니다.
              {failedSources.length > 0 &&
                ' 일부 출처 조회가 실패해 신규 공고 비교가 불완전할 수 있습니다.'}
            </p>
          )}
          <div className="sources">
            {result.sources.map((s) => (
              <span key={s.source} className={`source${s.error ? ' source-failed' : ''}`}>
                {s.source}:{' '}
                {s.error
                  ? `조회 실패 · ${s.error}`
                  : `${s.count}건 일치${s.cached ? ' · 기존 수집본 사용' : ' · 조회 완료'}`}
                <small>
                  {s.checkedAt ? `출처 확인 ${date(s.checkedAt)}` : '출처 확인 실패'}
                  {olderThan(s.checkedAt, 1) ? ' · 24시간 경과' : ''}
                </small>
              </span>
            ))}
          </div>
          {newIds !== undefined && result.previousSearchedAt && (
            <label className="checkbox results-toggle">
              <input
                type="checkbox"
                checked={newOnly}
                onChange={(e) => onNewOnly(e.target.checked)}
              />
              이전 검색 이후 발견한 공고만 보기 ({newIds.length}건)
            </label>
          )}
        </>
      )}
      <div className="filters-grid">
        <label>
          키워드
          <input value={filters.query} onChange={(e) => onField('query', e.target.value)} />
        </label>
        <FilterSelect
          label="계약 형태"
          value={filters.contract}
          onChange={(v) => onField('contract', v)}
        >
          <option value="">전체</option>
          {uniqueContract.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </FilterSelect>
        <label>
          최소 보수
          <input
            type="number"
            min="0"
            step="any"
            value={filters.minimum}
            disabled={!filters.unit || !filters.currency}
            onChange={(e) => onField('minimum', e.target.value)}
          />
        </label>
        <FilterSelect label="지급 단위" value={filters.unit} onChange={(v) => onField('unit', v)}>
          <option value="">전체</option>
          {Object.entries(units).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="통화"
          value={filters.currency}
          onChange={(v) => onField('currency', v)}
        >
          <option value="">전체</option>
          {uniqueCurrency.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </FilterSelect>
        <FilterSelect
          label="근무 방식"
          value={filters.workMode}
          onChange={(v) => onField('workMode', v)}
        >
          <option value="">전체</option>
          {uniqueWorkMode.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </FilterSelect>
        <FilterSelect label="한국 근무" value={filters.korea} onChange={(v) => onField('korea', v)}>
          <option value="">전체</option>
          {Object.entries(korea).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="게시일" value={filters.days} onChange={(v) => onField('days', v)}>
          <option value="">전체 / 미기재 포함</option>
          <option value="7">최근 7일</option>
          <option value="30">최근 30일</option>
        </FilterSelect>
        <FilterSelect label="정렬" value={filters.sort} onChange={(v) => onField('sort', v)}>
          <option value="match">매치 점수 높은 순 (규칙 기반)</option>
          <option value="newest">게시일 최신순</option>
          <option value="pay" disabled={!canComparePay}>
            최소 보수 높은 순
          </option>
        </FilterSelect>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={filters.includeUnknown}
            onChange={(e) => onField('includeUnknown', e.target.checked)}
          />
          보수 미기재 포함
        </label>
      </div>
      <p className="muted">
        최소 보수·보수순 정렬은 통화와 지급 단위를 모두 선택한 뒤 사용합니다. 공고의 하한 금액을
        비교하며 상한만 있는 공고는 최소 보수 조건을 충족한 것으로 보지 않습니다. 미기재 포함을
        선택하면 금액 없는 공고는 별도로 유지됩니다. 매치 점수는 이력서·공고의 규칙 기반 일치도이며
        지원 가능성이나 합격 확률이 아닙니다.
      </p>
      <label className="checkbox">
        <input type="checkbox" checked={showLow} onChange={(e) => onShowLow(e.target.checked)} />
        낮은 관련성 결과도 보기
      </label>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {[
                '직무 / 회사',
                '매치 적합도',
                '매치 근거',
                '계약 형태',
                '보수',
                '지급 단위',
                '통화',
                '근무 조건',
                '출처 / 검증',
                '게시일',
                '',
              ].map((h, i) => (
                <th key={i}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((j) => (
              <tr key={j.id}>
                <td>
                  <button className="job-title" onClick={() => onOpenDetail(j)}>
                    {j.title}
                  </button>
                  {newIds?.includes(j.id) && (
                    <span className="new-badge">이번 검색에서 새로 발견</span>
                  )}
                  <p>{j.company}</p>
                  <small>{j.kind}</small>
                  {!!j.safetySignals?.length && (
                    <small className="caution-label">
                      확인할 조건 {j.safetySignals.length}건 · 상세 근거 보기
                    </small>
                  )}
                </td>
                <td>
                  <button
                    className={`score ${j.matchScoreLabel ?? 'low'}`}
                    onClick={() => onOpenDetail(j)}
                  >
                    {j.matchScore === undefined ? '미산정' : `${j.matchScore}/100`}
                  </button>
                  <small>
                    {j.matchScoreLabel ? scoreLabels[j.matchScoreLabel] : '등급 미산정'} ·{' '}
                    {j.scoreVersion ?? '이전 기준'}
                  </small>
                </td>
                <td>{(j.matchedEvidence ?? j.match).join(', ') || '일치 근거 미확인'}</td>
                <td>{j.contract}</td>
                <td className="money">{money(j)}</td>
                <td>{j.compensation.unit ? units[j.compensation.unit] : '미기재'}</td>
                <td>{j.compensation.currency ?? '미기재'}</td>
                <td>
                  {j.workMode}
                  <p>{j.location}</p>
                  <small>{korea[j.korea]}</small>
                  <p>{j.hours ?? '근무시간 미기재'}</p>
                </td>
                <td>
                  {j.source}
                  <p>{j.sourceStatus || '출처 검증 상태 미확인'}</p>
                  <small>고용주 교차 검증 미완료 · 지급·계약 조건은 원문 확인</small>
                  <small>마지막 조회 {date(j.checkedAt)}</small>
                </td>
                <td>{date(j.postedAt)}</td>
                <td>
                  <button disabled={!!busy} onClick={() => onSave(j)}>
                    {saved.some((s) => s.id === j.id) ? '저장 해제' : '저장'}
                  </button>
                  <a className="external" href={j.url} target="_blank" rel="noopener noreferrer">
                    공고·지원 페이지 ↗
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!visible.length && (
        <div className="empty">
          {newOnly
            ? '이전 검색 이후 새로 발견한 공고 중 현재 필터 조건에 맞는 결과가 없습니다. 새 공고만 보기를 해제하면 다른 결과도 확인할 수 있습니다.'
            : result || savedOnly
              ? '현재 조건에 맞는 공고가 없습니다. 필터를 조정하거나 프로필의 검색 키워드를 바꿔 보세요.'
              : '프로필을 확인하고 공고 찾기를 눌러 주세요.'}
        </div>
      )}
    </section>
  );
}
