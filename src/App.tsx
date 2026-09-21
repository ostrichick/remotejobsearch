import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  defaultFilters,
  filterJobs,
  type Filters,
  type Job,
  type Profile,
  type SearchResult,
} from './domain';
import { readResume } from './resume';
import { emptyPreferences, parsePreferences, type Preferences } from './preferences';
import { api, fetchMe, hasSearchKeyword, validLinkedinUrl, type Trust } from './api';
import Login from './components/Login';
import ProfilePanel from './components/ProfilePanel';
import PreferencesPanel from './components/PreferencesPanel';
import ResultsPanel from './components/ResultsPanel';
import JobDetailModal from './components/JobDetailModal';
import EvaluationPanel from './components/EvaluationPanel';
import './workspace.css';

const empty: Profile = {
  skills: [],
  languages: [],
  experience: [],
  education: [],
  keywords: [],
  mode: 'local',
  linkedinUrl: '',
};

type EditableField =
  | 'skills'
  | 'languages'
  | 'experience'
  | 'education'
  | 'keywords'
  | 'primaryRoleKeywords'
  | 'skillKeywords'
  | 'languageKeywords'
  | 'negativeKeywords';

export default function App() {
  const [me, setMe] = useState<{ email: string; aiEnabled?: boolean } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [profile, setProfile] = useState<Profile>(empty);
  const [dirty, setDirty] = useState(false);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [analysisConsent, setAnalysisConsent] = useState(false);
  const [aiConsent, setAiConsent] = useState(false);
  const [storeOriginal, setStoreOriginal] = useState(false);
  const [preferenceNotice, setPreferenceNotice] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [saved, setSaved] = useState<Job[]>([]);
  const [savedOnly, setSavedOnly] = useState(false);
  const [newOnly, setNewOnly] = useState(false);
  const [searchOutdated, setSearchOutdated] = useState(false);
  const [showLow, setShowLow] = useState(false);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [detail, setDetail] = useState<Job | null>(null);
  const [trust, setTrust] = useState<Record<string, Trust>>({});
  const [resume, setResume] = useState<{ filename: string } | null>(null);
  const [evaluationGeneration, setEvaluationGeneration] = useState(0);

  const preferences = profile.preferences ?? emptyPreferences;

  const load = useCallback(async () => {
    try {
      const me = await fetchMe();
      if (!me) {
        setLoaded(true);
        return;
      }
      setMe(me);
      const [p, j, s, t, f] = await Promise.all([
        api<Profile | null>('profile'),
        api<SearchResult | null>('search'),
        api<Job[]>('saved'),
        api<Record<string, Trust>>('trust'),
        api<{ filename: string } | null>('resume'),
      ]);
      setProfile(p ?? empty);
      setResult(j);
      setSaved(s);
      setTrust(t);
      setResume(f);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(async (message: string, fn: () => Promise<void>) => {
    setBusy(message);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }, []);

  const analyze = useCallback(() => {
    if (!analysisConsent || !validLinkedinUrl(profile.linkedinUrl ?? '')) return;
    void run('문서에서 텍스트와 항목을 추출하고 있습니다…', async () => {
      const extracted = file ? await readResume(file) : text;
      if (me?.aiEnabled && aiConsent && extracted.length > 16000) {
        throw new Error(
          'AI 분석은 16,000자 이하만 지원합니다. AI 분석 동의를 해제하면 규칙 기반으로 분석할 수 있습니다.',
        );
      }
      const form = new FormData();
      form.set('text', extracted);
      form.set('analysisConsent', 'true');
      if (file && storeOriginal) form.set('file', file);
      if (me?.aiEnabled && aiConsent) form.set('aiConsent', 'true');
      const analyzed = await api<Profile>('analyze', 'POST', form);
      // /analyze replaces the extracted fields. Persist any unsaved link/conditions with them.
      const next = {
        ...analyzed,
        linkedinUrl: (profile.linkedinUrl ?? analyzed.linkedinUrl ?? '').trim(),
        preferences: profile.preferences ?? analyzed.preferences,
      };
      setProfile(await api<Profile>('profile', 'PUT', next));
      setSearchOutdated(true);
      setResume(await api('resume'));
      setDirty(false);
      setFile(null);
      setText('');
      setAnalysisConsent(false);
      setAiConsent(false);
      setStoreOriginal(false);
    });
  }, [analysisConsent, aiConsent, file, me?.aiEnabled, profile, run, storeOriginal, text]);

  const findJobs = useCallback(() => {
    if (!hasSearchKeyword(profile.keywords)) {
      setError('두 글자 이상의 유효한 검색 키워드를 입력해 주세요.');
      return;
    }
    if (!validLinkedinUrl(profile.linkedinUrl ?? '')) {
      setError('LinkedIn 주소를 확인하거나 비워 주세요.');
      return;
    }
    void run(
      '프로필 저장 후 공개 채용 보드를 검색하고 있습니다. 최대 30초 정도 걸릴 수 있습니다…',
      async () => {
        const p = await api<Profile>('profile', 'PUT', profile);
        setProfile(p);
        setDirty(false);
        setResult(await api<SearchResult>('search', 'POST', {}));
        setSearchOutdated(false);
        setSavedOnly(false);
        setNewOnly(false);
      },
    );
  }, [profile, run]);

  const changeLinkedin = useCallback((url: string) => {
    setProfile((p) => ({ ...p, linkedinUrl: url }));
    setDirty(true);
  }, []);

  const edit = useCallback((k: EditableField, value: string) => {
    setProfile((p) => ({
      ...p,
      [k]: value.split(k === 'experience' || k === 'education' ? '\n' : ','),
    }));
    setDirty(true);
    setSearchOutdated(true);
  }, []);

  const changePreference = useCallback((change: Partial<Preferences>) => {
    setProfile((p) => ({
      ...p,
      preferences: { ...(p.preferences ?? emptyPreferences), ...change },
    }));
    setDirty(true);
    setSearchOutdated(true);
  }, []);

  const parsePreferenceText = useCallback(() => {
    const parsed = parsePreferences(profile.preferences?.text ?? '');
    changePreference(parsed.value);
    setPreferenceNotice(parsed.notice);
  }, [profile.preferences?.text, changePreference]);

  const resetPreferences = useCallback(() => {
    changePreference(emptyPreferences);
    setPreferenceNotice('조건을 초기화했습니다. 다시 검색하면 반영됩니다.');
  }, [changePreference]);

  const saveProfile = useCallback(() => {
    if (!validLinkedinUrl(profile.linkedinUrl ?? '')) {
      setError('LinkedIn 주소를 확인하거나 비워 주세요.');
      return;
    }
    void run('프로필 저장 중…', async () => {
      setProfile(await api<Profile>('profile', 'PUT', profile));
      setDirty(false);
    });
  }, [profile, run]);

  const deleteResume = useCallback(() => {
    void run('원본을 삭제하고 있습니다…', async () => {
      await api('resume', 'DELETE');
      setResume(null);
    });
  }, [run]);

  const save = useCallback(
    (job: Job) => {
      void run('저장 상태를 변경하고 있습니다…', async () => {
        await api('saved', saved.some((s) => s.id === job.id) ? 'DELETE' : 'POST', { id: job.id });
        setSaved(await api('saved'));
      });
    },
    [saved, run],
  );

  const field = useCallback((k: keyof Filters, v: string | boolean) => {
    setFilters((f) => ({ ...f, [k]: v }));
  }, []);

  const deleteAllData = useCallback(() => {
    if (!window.confirm('본인의 이력서 원본·프로필·검색 결과·저장 공고를 모두 삭제할까요?')) return;
    void run('개인 데이터를 삭제하고 있습니다…', async () => {
      await api('data', 'DELETE');
      setProfile(empty);
      setFile(null);
      setText('');
      setAnalysisConsent(false);
      setAiConsent(false);
      setStoreOriginal(false);
      setResume(null);
      setResult(null);
      setSaved([]);
      setEvaluationGeneration((generation) => generation + 1);
      setNewOnly(false);
      setSearchOutdated(false);
    });
  }, [run]);

  const visible = useMemo(
    () =>
      filterJobs(savedOnly ? saved : (result?.jobs ?? []), filters).filter(
        (j) =>
          (showLow || j.matchScoreLabel !== 'low') &&
          (!newOnly || (result?.newJobIds?.includes(j.id) ?? false)),
      ),
    [savedOnly, saved, result, filters, showLow, newOnly],
  );
  const allJobs = savedOnly ? saved : (result?.jobs ?? []);
  const canFind = hasSearchKeyword(profile.keywords);

  if (!loaded) return <main className="loading">서비스에 연결하고 있습니다…</main>;
  if (!me) return <Login error={error} />;

  return (
    <main className="workspace">
      <header className="bar">
        <a className="brand" href="/">
          RoleScout
        </a>
        <span>{me.email}</span>
        <a href="/signout-with-chatgpt?return_to=/" target="_top">
          로그아웃
        </a>
      </header>
      <div className="notice">
        실제 공개 공고를 조회합니다. 문서 분석은 규칙 기반이 기본이며
        {me.aiEnabled
          ? ' 별도로 동의하면 AI 분석을 사용할 수 있습니다.'
          : ' AI 분석은 현재 연결되지 않았습니다.'}{' '}
        추출 결과와 검색 키워드를 직접 확인해 주세요.
      </div>
      {error && (
        <div className="error" role="alert">
          {error}
          <button onClick={() => setError('')}>닫기</button>
        </div>
      )}
      {busy && (
        <div className="progress" role="status">
          {busy}
        </div>
      )}
      <ProfilePanel
        profile={profile}
        busy={!!busy}
        dirty={dirty}
        file={file}
        text={text}
        linkedin={profile.linkedinUrl ?? ''}
        analysisConsent={analysisConsent}
        aiAvailable={!!me.aiEnabled}
        aiConsent={aiConsent}
        storeOriginal={storeOriginal}
        resume={resume}
        onFileChange={(next) => {
          setFile(next);
          setStoreOriginal(false);
          setAnalysisConsent(false);
          setAiConsent(false);
        }}
        onTextChange={setText}
        onLinkedinChange={changeLinkedin}
        onAnalysisConsentChange={(consent) => {
          setAnalysisConsent(consent);
          if (!consent) setAiConsent(false);
        }}
        onAiConsentChange={setAiConsent}
        onStoreOriginalChange={setStoreOriginal}
        onEdit={edit}
        onAnalyze={analyze}
        onSave={saveProfile}
        onFindJobs={findJobs}
        onDeleteResume={deleteResume}
      />
      <PreferencesPanel
        preferences={preferences}
        busy={!!busy}
        notice={preferenceNotice}
        canFind={canFind}
        onChange={changePreference}
        onParse={parsePreferenceText}
        onReset={resetPreferences}
        onFindJobs={findJobs}
      />
      <ResultsPanel
        result={result}
        saved={saved}
        savedOnly={savedOnly}
        newOnly={newOnly}
        searchOutdated={searchOutdated}
        showLow={showLow}
        filters={filters}
        visible={visible}
        allJobs={allJobs}
        busy={!!busy}
        onToggleSavedOnly={() => setSavedOnly((v) => !v)}
        onNewOnly={setNewOnly}
        onShowLow={setShowLow}
        onField={field}
        onOpenDetail={setDetail}
        onSave={save}
        onFindJobs={findJobs}
      />
      <EvaluationPanel key={evaluationGeneration} jobs={result?.jobs ?? []} />
      <JobDetailModal job={detail} trust={trust} onClose={() => setDetail(null)} />
      <details className="panel">
        <summary>검색 범위와 개인정보 관리</summary>
        <p>
          Welo Global(언어·AI), Coupang(한국 등 여러 직군), Mercor(사내 직무)의 공개 채용 보드를
          조회합니다. 일반 웹 전체 검색이나 모든 원격 플랫폼을 포괄하지 않습니다. 검색어는 서버에서
          공고와 비교하며 이력서·연락처는 채용 사이트로 보내지 않습니다.
        </p>
        <p>
          문서 분석에 동의하면 추출 텍스트가 서버에 전송되고 분석된 프로필이 저장됩니다. 별도의 AI
          분석 동의와 API 연결이 있을 때에만 추출 텍스트가 외부 OpenAI API로 전송됩니다. 원본 파일은
          별도로 저장하도록 선택했을 때에만 업로드됩니다. 이미 저장된 원본은 원본만 삭제 버튼으로
          삭제할 수 있습니다. 프로필과 원본은 삭제 요청 전까지 보관됩니다. 기본 추출은 제한된 사전과
          문장 규칙을 사용하므로 누락된 경력·기술·학력은 직접 보완해 주세요.
        </p>
        <button className="danger" disabled={!!busy} onClick={deleteAllData}>
          내 데이터 모두 삭제
        </button>
      </details>
    </main>
  );
}
