import type { Profile } from '../domain';

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
  resume: { filename: string } | null;
  onFileChange: (file: File | null) => void;
  onTextChange: (text: string) => void;
  onLinkedinChange: (url: string) => void;
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
  resume,
  onFileChange,
  onTextChange,
  onLinkedinChange,
  onEdit,
  onAnalyze,
  onSave,
  onFindJobs,
  onDeleteResume,
}: ProfilePanelProps) {
  const canFind = profile.keywords.some((k) => k.trim());
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
              type="file"
              accept=".pdf,.docx"
              disabled={!!busy}
              onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
            />
          </label>
          <label>
            또는 이력서 텍스트
            <textarea
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              rows={5}
              placeholder="경력·기술·언어·학력이 포함된 텍스트"
              disabled={!!file}
            />
          </label>
          <label>
            LinkedIn 프로필 URL
            <input
              type="url"
              value={linkedin}
              onChange={(e) => onLinkedinChange(e.target.value)}
              placeholder="https://www.linkedin.com/in/…"
            />
          </label>
          {linkedin && (
            <p className="notice">
              LinkedIn 전체 경력을 가져오는 공식 권한이 연결되지 않았습니다. 프로필 PDF 또는
              텍스트를 위에 제공해 주세요. URL만으로는 분석되지 않습니다.
            </p>
          )}
          <p className="muted">
            텍스트 추출은 브라우저에서 진행하며, 파일 원본과 추출 항목은 본인 계정의 비공개 저장소에
            보관됩니다. 현재 외부 AI로 전송하지 않습니다.
          </p>
          <button
            className="primary"
            disabled={!!busy || (!file && !text.trim())}
            onClick={onAnalyze}
          >
            이력서 읽기
          </button>
          {resume && (
            <p>
              저장된 원본: {resume.filename}{' '}
              <button disabled={!!busy} onClick={onDeleteResume}>
                원본만 삭제
              </button>
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
              disabled={!!busy}
              onClick={() => {
                onSave();
              }}
            >
              프로필 저장{dirty ? ' *' : ''}
            </button>
            <button className="primary" disabled={!!busy || !canFind} onClick={onFindJobs}>
              공고 찾기
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
