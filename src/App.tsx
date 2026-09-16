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
import { api, fetchMe, type Trust } from './api';
import Login from './components/Login';
import ProfilePanel from './components/ProfilePanel';
import PreferencesPanel from './components/PreferencesPanel';
import ResultsPanel from './components/ResultsPanel';
import JobDetailModal from './components/JobDetailModal';
import './workspace.css';

const empty: Profile = {
  skills: [],
  languages: [],
  experience: [],
  education: [],
  keywords: [],
  mode: 'local',
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
  const [me, setMe] = useState<{ email: string } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [profile, setProfile] = useState<Profile>(empty);
  const [dirty, setDirty] = useState(false);
  const [text, setText] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preferenceNotice, setPreferenceNotice] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const [saved, setSaved] = useState<Job[]>([]);
  const [savedOnly, setSavedOnly] = useState(false);
  const [showLow, setShowLow] = useState(false);
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [detail, setDetail] = useState<Job | null>(null);
  const [trust, setTrust] = useState<Record<string, Trust>>({});
  const [resume, setResume] = useState<{ filename: string } | null>(null);

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
    void run('문서에서 텍스트와 항목을 추출하고 있습니다…', async () => {
      const extracted = file ? await readResume(file) : text;
      const form = new FormData();
      form.set('text', extracted);
      if (file) form.set('file', file);
      setProfile(await api<Profile>('analyze', 'POST', form));
      setResume(await api('resume'));
      setDirty(false);
      setFile(null);
      setText('');
    });
  }, [file, text, run]);

  const findJobs = useCallback(() => {
    void run(
      '프로필 저장 후 공개 채용 보드를 검색하고 있습니다. 최대 30초 정도 걸릴 수 있습니다…',
      async () => {
        const p = await api<Profile>('profile', 'PUT', profile);
        setProfile(p);
        setDirty(false);
        setResult(await api<SearchResult>('search', 'POST', {}));
        setSavedOnly(false);
      },
    );
  }, [profile, run]);

  const edit = useCallback((k: EditableField, value: string) => {
    setProfile((p) => ({
      ...p,
      [k]: value.split(k === 'experience' || k === 'education' ? '\n' : ','),
    }));
    setDirty(true);
  }, []);

  const changePreference = useCallback((change: Partial<Preferences>) => {
    setProfile((p) => ({
      ...p,
      preferences: { ...(p.preferences ?? emptyPreferences), ...change },
    }));
    setDirty(true);
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
      setResume(null);
      setResult(null);
      setSaved([]);
    });
  }, [run]);

  const visible = useMemo(
    () =>
      filterJobs(savedOnly ? saved : (result?.jobs ?? []), filters).filter(
        (j) => showLow || j.matchScoreLabel !== 'low',
      ),
    [savedOnly, saved, result, filters, showLow],
  );
  const allJobs = savedOnly ? saved : (result?.jobs ?? []);
  const canFind = profile.keywords.some((k) => k.trim());

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
        실제 공개 공고를 조회합니다. 문서 분석은 현재 규칙 기반 기본 추출이며, AI 의미 분석은 API
        연결 전입니다. 추출 결과와 검색 키워드를 확인해 주세요.
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
        linkedin={linkedin}
        resume={resume}
        onFileChange={setFile}
        onTextChange={setText}
        onLinkedinChange={setLinkedin}
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
        showLow={showLow}
        filters={filters}
        visible={visible}
        allJobs={allJobs}
        busy={!!busy}
        onToggleSavedOnly={() => setSavedOnly((v) => !v)}
        onShowLow={setShowLow}
        onField={field}
        onOpenDetail={setDetail}
        onSave={save}
      />
      <JobDetailModal job={detail} trust={trust} onClose={() => setDetail(null)} />
      <details className="panel">
        <summary>검색 범위와 개인정보 관리</summary>
        <p>
          Welo Global(언어·AI), Coupang(한국 등 여러 직군), Mercor(사내 직무)의 공개 채용 보드를
          조회합니다. 일반 웹 전체 검색이나 모든 원격 플랫폼을 포괄하지 않습니다. 검색어는 서버에서
          공고와 비교하며 이력서·연락처는 채용 사이트로 보내지 않습니다.
        </p>
        <p>
          문서 원본과 프로필은 삭제할 때까지 보관됩니다. 기본 추출은 제한된 사전과 문장 규칙을
          사용하므로 누락된 경력·기술·학력은 직접 보완해 주세요. 로그인은 ChatGPT 계정을 사용합니다.
        </p>
        <button className="danger" disabled={!!busy} onClick={deleteAllData}>
          내 데이터 모두 삭제
        </button>
      </details>
    </main>
  );
}
