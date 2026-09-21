import { useEffect, useRef } from 'react';
import type { Profile } from '../domain';
import { hasSearchKeyword, validLinkedinUrl } from '../api';

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

const sectionLabels: Record<string, string> = {
  skills: '기술·역량 (쉼표 구분)',
  languages: '언어 (쉼표 구분)',
  experience: '경력 (줄 구분)',
  education: '학력 (줄 구분)',
  keywords: '공고 검색 키워드 (쉼표 구분)',
};

const keywordLabels: Record<string, string> = {
  primaryRoleKeywords: '핵심 직무 키워드',
  skillKeywords: '기술·업무 키워드',
  languageKeywords: '언어 키워드',
  negativeKeywords: '제외 키워드',
};

interface ProfilePanelProps {
  profile: Profile;
  busy: boolean;
  dirty: boolean;
  file: File | null;
  text: string;
  linkedin: string;
  analysisConsent: boolean;
  aiAvailable: boolean;
  aiConsent: boolean;
  storeOriginal: boolean;
  resume: { filename: string } | null;
  onFileChange: (file: File | null) => void;
  onTextChange: (text: string) => void;
  onLinkedinChange: (url: string) => void;
  onAnalysisConsentChange: (checked: boolean) => void;
  onAiConsentChange: (checked: boolean) => void;
  onStoreOriginalChange: (checked: boolean) => void;
  onEdit: (key: EditableField, value: string) => void;
  onAnalyze: () => void;
  onSave: () => void;
  onFindJobs: () => void;
  onDeleteResume: () => void;
}

const multiline: EditableField[] = ['experience', 'education'];
const isMultiline = (k: EditableField) => multiline.includes(k);
const join = (list: string[], multiline: boolean) => list.join(multiline ? '\n' : ',');

export default function ProfilePanel({
  profile,
  busy,
  dirty,
  file,
  text,
  linkedin,
  analysisConsent,
  aiAvailable,
  aiConsent,
  storeOriginal,
  resume,
  onFileChange,
  onTextChange,
  onLinkedinChange,
  onAnalysisConsentChange,
  onAiConsentChange,
  onStoreOriginalChange,
  onEdit,
  onAnalyze,
  onSave,
  onFindJobs,
  onDeleteResume,
}: ProfilePanelProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!file && fileInput.current) fileInput.current.value = '';
  }, [file]);
  const canFind = hasSearchKeyword(profile.keywords);
  const validLink = validLinkedinUrl(linkedin);
  const canAnalyze = Boolean(file || text.trim().length >= 40);
  return (
    <section className="panel">
      <h1>내 프로필</h1>
      <p className="muted">
        희망 보수나 근무시간은 입력하지 않아도 됩니다. 먼저 이력서를 읽거나 프로필을 직접
        작성하세요.
      </p>
      <div className="input-grid">
        <div>
          <label>
            이력서 PDF / DOCX (최대 5MB)
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.docx"
              disabled={!!busy}
              onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
            />
          </label>
          {file && (
            <p className="field-help">
              선택한 파일: {file.name}{' '}
              <button disabled={!!busy} onClick={() => onFileChange(null)}>
                파일 선택 해제
              </button>
            </p>
          )}
          <label>
            또는 이력서 텍스트
            <textarea
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              rows={5}
              maxLength={60000}
              placeholder="경력·기술·언어·학력이 포함된 텍스트"
              disabled={!!file || !!busy}
            />
          </label>
          {!file && text.trim().length > 0 && text.trim().length < 40 && (
            <p className="field-help">분석에는 40자 이상의 텍스트가 필요합니다.</p>
          )}
          <label>
            LinkedIn 프로필 URL (선택 · 프로필 저장 시 함께 보관)
            <input
              type="url"
              value={linkedin}
              onChange={(e) => onLinkedinChange(e.target.value)}
              placeholder="https://www.linkedin.com/in/…"
              maxLength={500}
              aria-invalid={!validLink}
              disabled={!!busy}
            />
          </label>
          {!validLink && (
            <p className="field-error" role="alert">
              https://www.linkedin.com/in/… 형식의 주소를 입력하거나 비워 주세요.
            </p>
          )}
          <p className="muted">
            이 주소는 프로필에 기록하기만 합니다. LinkedIn에 연결하거나 프로필 내용을 자동으로 읽지
            않습니다. 대신 본인이 내려받은 PDF, DOCX 또는 텍스트를 입력할 수 있습니다.
          </p>
          {file && (
            <label className="checkbox consent-option">
              <input
                type="checkbox"
                checked={storeOriginal}
                onChange={(e) => onStoreOriginalChange(e.target.checked)}
                disabled={!!busy}
              />
              원본 파일도 내 계정에 저장 (선택)
            </label>
          )}
          <p className="muted">
            파일 텍스트는 브라우저에서 추출됩니다. 분석 시 추출 텍스트를 서버에 전송하고 프로필에
            저장합니다. 원본 파일은 위 항목을 선택한 경우에만 별도 저장합니다. AI 분석을 별도로
            동의하지 않으면 규칙 기반으로만 분석하며 외부 AI에 보내지 않습니다.
          </p>
          {file && !storeOriginal && (
            <p className="notice">
              원본 저장을 선택하지 않았습니다. 추출 텍스트는 분석·프로필 저장을 위해 전송하지만,
              선택한 원본 파일은 전송하지 않습니다.
            </p>
          )}
          <label className="checkbox consent-option">
            <input
              type="checkbox"
              checked={analysisConsent}
              onChange={(e) => onAnalysisConsentChange(e.target.checked)}
              disabled={!!busy}
            />
            추출 텍스트를 서버로 보내 분석하고 프로필을 저장하는 데 동의합니다. (필수)
          </label>
          {aiAvailable && (
            <label className="checkbox consent-option">
              <input
                type="checkbox"
                checked={aiConsent}
                onChange={(e) => onAiConsentChange(e.target.checked)}
                disabled={!!busy || !analysisConsent}
              />
              OpenAI API로 추출 텍스트를 전송해 AI로 분석하는 데 별도로 동의합니다. (선택)
              <small>
                AI 분석을 선택하면 추출 텍스트가 외부 OpenAI API로 전송됩니다. OpenAI API는
                기본적으로 악용 모니터링 로그를 최대 30일 보관할 수 있습니다. 원본 PDF·DOCX 파일
                자체는 AI에 전송하지 않습니다. AI 분석은 16,000자 이하만 지원합니다.
              </small>
            </label>
          )}
          {!aiAvailable && <p className="field-help">AI 분석 미연결 · 규칙 기반으로 분석합니다.</p>}
          <button
            className="primary"
            disabled={!!busy || !canAnalyze || !analysisConsent || !validLink}
            onClick={onAnalyze}
          >
            {aiAvailable && aiConsent ? 'AI로 이력서 분석' : '이력서 읽기'}
          </button>
          {resume && (
            <p className="stored-resume">
              기존 저장 원본: {resume.filename}{' '}
              <button disabled={!!busy} onClick={onDeleteResume}>
                원본만 삭제
              </button>
              <small>
                원본 저장을 선택하지 않고 새로 분석해도 기존 원본은 유지됩니다. 삭제해도 추출된
                프로필은 그대로 남습니다.
              </small>
            </p>
          )}
        </div>
        <div>
          {(['skills', 'languages', 'experience', 'education', 'keywords'] as EditableField[]).map(
            (k) => (
              <label key={k}>
                {sectionLabels[k]}
                <textarea
                  rows={k === 'experience' ? 3 : 2}
                  value={join(profile[k] ?? [], isMultiline(k))}
                  onChange={(e) => onEdit(k, e.target.value)}
                  disabled={!!busy}
                />
              </label>
            ),
          )}
          <details>
            <summary>검색 키워드 분류 (선택 수정)</summary>
            {(
              [
                'primaryRoleKeywords',
                'skillKeywords',
                'languageKeywords',
                'negativeKeywords',
              ] as EditableField[]
            ).map((k) => (
              <label key={k}>
                {keywordLabels[k]}
                <textarea
                  rows={2}
                  value={join(profile[k] ?? [], false)}
                  onChange={(e) => onEdit(k, e.target.value)}
                  disabled={!!busy}
                />
              </label>
            ))}
            <p className="muted">
              이력서에서 자동 분류된 값이며 직접 수정할 수 있습니다. 제외 키워드가 포함된 공고는
              검색에서 제외합니다.
            </p>
          </details>
          <div className="actions">
            <button
              disabled={!!busy || !validLink}
              onClick={() => {
                onSave();
              }}
            >
              프로필 저장{dirty ? ' *' : ''}
            </button>
            <button
              className="primary"
              disabled={!!busy || !canFind || !validLink}
              onClick={onFindJobs}
            >
              공고 찾기
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
