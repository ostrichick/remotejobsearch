import type { Filters, Job, SearchResult } from '../domain';
import { units } from '../domain';

const korea = {
  confirmed: '한국 근무지/거주 명시',
  excluded: '한국 제외 조건',
  unknown: '한국 가능 여부 미확인',
};
const date = (s: string | null) => (s ? new Date(s).toLocaleString('ko-KR') : '미기재');
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
  showLow: boolean;
  filters: Filters;
  visible: Job[];
  allJobs: Job[];
  busy: boolean;
  onToggleSavedOnly: () => void;
  onShowLow: (show: boolean) => void;
  onField: (key: keyof Filters, value: string | boolean) => void;
  onOpenDetail: (job: Job) => void;
  onSave: (job: Job) => void;
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
  showLow,
  filters,
  visible,
  allJobs,
  busy,
  onToggleSavedOnly,
  onShowLow,
  onField,
  onOpenDetail,
  onSave,
}: ResultsPanelProps) {
  const unique = (key: (j: Job) => string | null | undefined) => [
    ...new Set(allJobs.map((j) => key(j)).filter((v): v is string => !!v)),
  ];
  const uniqueContract = [...new Set(allJobs.map((j) => j.contract))];
  const uniqueCurrency = unique((j) => j.compensation.currency);
  const uniqueWorkMode = [...new Set(allJobs.map((j) => j.workMode))];
  const canComparePay = !!filters.currency && !!filters.unit;

  return (
    <section className="panel">
      <div className="heading">
        <h2>
          {savedOnly ? '저장한 공고' : '검색 결과'} <span>{visible.length}</span>
        </h2>
        <button onClick={onToggleSavedOnly}>
          {savedOnly ? '검색 결과 보기' : `저장한 공고 (${saved.length})`}
        </button>
      </div>
      {result && (
        <>
          <p className="muted">
            검색: {date(result.searchedAt)} · 키워드: {result.keywords.join(', ')} · 최대 150건 표시
          </p>
          <div className="sources">
            {result.sources.map((s) => (
              <span key={s.source} className={s.error ? 'error' : 'source'}>
                {s.source}: {s.error ?? `${s.count}건 일치${s.cached ? ' · 15분 내 캐시' : ''}`}
                <small>{s.checkedAt ? date(s.checkedAt) : '확인 실패'}</small>
              </span>
            ))}
          </div>
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
          <option value="match">일치 키워드 많은 순</option>
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
        선택하면 금액 없는 공고는 별도로 유지됩니다.
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
                  <p>{j.company}</p>
                  <small>{j.kind}</small>
                </td>
                <td>
                  <button
                    className={`score ${j.matchScoreLabel ?? 'low'}`}
                    onClick={() => onOpenDetail(j)}
                  >
                    {j.matchScore ?? 0}%
                  </button>
                  <small>
                    {j.matchScoreLabel ?? 'unknown'} · {j.scoreVersion ?? 'legacy'}
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
                  <p>ATS 원문 확인</p>
                  <small>지급 {j.platform === 'welo' ? '근거 있음 · 상세 확인' : '미검증'}</small>
                </td>
                <td>{date(j.postedAt)}</td>
                <td>
                  <button disabled={!!busy} onClick={() => onSave(j)}>
                    {saved.some((s) => s.id === j.id) ? '저장 해제' : '저장'}
                  </button>
                  <a className="external" href={j.url} target="_blank" rel="noopener noreferrer">
                    원문 ↗
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!visible.length && (
        <div className="empty">
          {result || savedOnly
            ? '현재 조건에 맞는 공고가 없습니다. 필터를 초기화하거나 프로필의 검색 키워드를 바꿔 보세요.'
            : '프로필을 확인하고 공고 찾기를 눌러 주세요.'}
        </div>
      )}
    </section>
  );
}
