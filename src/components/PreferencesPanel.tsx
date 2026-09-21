import type { Preferences } from '../preferences';

interface PreferencesPanelProps {
  preferences: Preferences;
  busy: boolean;
  notice: string;
  canFind: boolean;
  onChange: (change: Partial<Preferences>) => void;
  onParse: () => void;
  onReset: () => void;
  onFindJobs: () => void;
}

const contractOptions = ['프리랜서', '계약직', '정규직', '파트타임'];

export default function PreferencesPanel({
  preferences,
  busy,
  notice,
  canFind,
  onChange,
  onParse,
  onReset,
  onFindJobs,
}: PreferencesPanelProps) {
  return (
    <section className="panel">
      <h2>원하는 근무조건 (선택)</h2>
      <label>
        원하는 조건을 편하게 적어 주세요
        <textarea
          rows={3}
          maxLength={2000}
          value={preferences.text}
          disabled={!!busy}
          placeholder="예: 한국에서 가능한 원격근무, 프리랜서, 주 20시간 이하"
          onChange={(e) => onChange({ text: e.target.value })}
        />
      </label>
      <button disabled={!!busy || !preferences.text.trim()} onClick={onParse}>
        조건 해석하기
      </button>
      <p className="muted">
        문장을 수정한 뒤 조건 해석하기를 눌러 주세요. 아래 항목을 확인·수정하고 검색하면 적용됩니다.
        현재 기본 표현을 규칙으로 해석하며 외부 AI에는 전송하지 않습니다.
      </p>
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      <div className="filters-grid">
        <label className="checkbox">
          <input
            type="checkbox"
            checked={preferences.remote}
            onChange={(e) => onChange({ remote: e.target.checked })}
            disabled={!!busy}
          />
          원격 명시 공고만
        </label>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={preferences.korea}
            onChange={(e) => onChange({ korea: e.target.checked })}
            disabled={!!busy}
          />
          한국 근무 확인만
        </label>
        <label>
          근무 지역 (공고 표기)
          <input
            value={preferences.location}
            placeholder="예: Seoul"
            onChange={(e) => onChange({ location: e.target.value })}
            disabled={!!busy}
          />
        </label>
        <label>
          희망 계약 형태
          <select
            value={preferences.contract}
            onChange={(e) => onChange({ contract: e.target.value })}
            disabled={!!busy}
          >
            <option value="">제한 없음</option>
            {contractOptions.map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </label>
        <label>
          주당 최대 근무시간
          <input
            type="number"
            min="0"
            max="168"
            value={preferences.maxWeeklyHours}
            onChange={(e) => onChange({ maxWeeklyHours: e.target.value })}
            disabled={!!busy}
          />
        </label>
      </div>
      <p className="muted">
        선택한 조건은 모두 충족해야 합니다. 해당 조건을 확인할 수 없는 공고는 제외됩니다. 주당
        시간은 공고에 명시된 범위의 상한을 비교합니다. 지역은 공고의 근무지 표기로 검색됩니다.
      </p>
      <div className="actions">
        <button disabled={!!busy} onClick={onReset}>
          희망조건 초기화
        </button>
        <button className="primary" disabled={!!busy || !canFind} onClick={onFindJobs}>
          이 조건으로 공고 찾기
        </button>
      </div>
    </section>
  );
}
