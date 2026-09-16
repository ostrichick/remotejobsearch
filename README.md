# RoleScout (Remote Job Scout)

이력서를 올리면 공개 ATS 채용 보드의 실제 공고를 검색하고, **설명 가능한 매치 적합도**와 핵심 근무 조건(계약 형태·보수·원격 여부·한국 근무 가능 여부)을 비교 가능한 표로 보여 주는 개인화 공고 탐색 서비스입니다.

- 채용 사이트 (원문 링크) / 개인 계정, 문서, 저장 공고 모두 해당 사용자에게만 공개
- 문서 분석은 규칙 기반 추출, AI 의미 분석은 API 연결 전 상태
- 로그인: ChatGPT 계정 (링크를 받은 사용자만 가능한 테스트 배포)

## 주요 기능

| 기능                | 설명                                                             |
| ------------------- | ---------------------------------------------------------------- |
| 이력서 업로드       | PDF / DOCX / 텍스트 (`pdfjs-dist`, `mammoth`)                    |
| 프로필 추출 및 편집 | 기술·언어·경력·학력 + 검색 키워드 분류(직무/기술/언어/제외)      |
| 자연어 근무 조건    | 문장 → 원격·국가·계약형태·주당 시간 규칙 해석                    |
| 공고 검색           | Welo Global(Lever), Coupang(Greenhouse), Mercor(Ashby) 공개 보드 |
| 매치 점수           | 직무/기술/언어/경력/근무조건 가중 합산 + 일치·미확인 근거 표시   |
| 저장/필터/정렬      | 보수 단위·통화·한국 근무·게시일·매치순(기본)                     |

## 기술 스택

- **프론트엔드**: React 19, Vite, TypeScript
- **백엔드**: Cloudflare Workers (D1 + R2), Drizzle ORM
- **배포**: @openai/sites-vite-plugin (ChatGPT 로그인 연동)

## 시작하기

```bash
npm install
npm run db:local        # 로컬 D1 마이그레이션 적용
npm run dev             # Vite dev 서버 (로컬 Worker 프록시 포함)
```

| 스크립트                    | 설명                                           |
| --------------------------- | ---------------------------------------------- |
| `npm run dev`               | 개발 서버                                      |
| `npm run build`             | tsc 검사 + Vite client + esbuild server 번들   |
| `npm test`                  | 로컬 D1/R2 테스트 포함한 19개 단위·통합 테스트 |
| `npm run lint` / `lint:fix` | ESLint 검사/자동 수정                          |
| `npm run format`            | Prettier 정렬                                  |
| `npm run db:generate`       | Drizzle 마이그레이션 생성                      |

## 환경 변수

로컬 개발 변수는 `.env.example`과 `.dev.vars.example`을 참고해 `.env` / `.dev.vars`로 복사해 사용하세요. 모든 값은 선택이며 기본값으로 동작합니다.

## 문서

| 문서                                                                     | 내용                                               |
| ------------------------------------------------------------------------ | -------------------------------------------------- |
| [docs/PRD.md](docs/PRD.md)                                               | 제품 요구사항 초안 · 사용자 흐름 · 스키마 · 로드맵 |
| [docs/SOURCE_TRUST_AND_INGESTION.md](docs/SOURCE_TRUST_AND_INGESTION.md) | 공고 수집 방식과 출처·지급 신뢰도 표시 설계        |
| [docs/INITIAL_SEARCH_PROFILE.md](docs/INITIAL_SEARCH_PROFILE.md)         | 첫 개인화 검색 프로필 (비공개, gitignore 대상)     |

## 디렉터리 구조

```
src/
  App.tsx               # 상태 컨테이너
  components/           # Login / ProfilePanel / PreferencesPanel / ResultsPanel / JobDetailModal
  api.ts                # /api fetch 래퍼
  domain.ts             # Job/Profile/Filters 타입, filterJobs
  preferences.ts        # 자연어 근무 조건 해석/검증
  resume.ts             # PDF/DOCX 텍스트 추출
server/
  worker.ts             # API 라우터 (+ CSRF, 인증, 한도)
  env.ts                # Env 타입, 사용량 제한 설정
  profile.ts            # 프로필 추출/검증
  jobs.ts               # ATS 커넥터, 정규화, 검색
  relevance.ts          # 매치 점수 산정
db/schema.ts            # D1 스키마 (Drizzle)
tests/                  # node:test 기반 테스트
docs/                   # 제품/출처 신뢰도 문서
```

## 라이선스

라이선스가 명시되지 않은 사설 프로젝트입니다.
