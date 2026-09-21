# RoleScout (Remote Job Scout)

이력서를 올리면 공개 ATS 채용 보드의 실제 공고를 검색하고, **설명 가능한 매치 적합도**와 핵심 근무 조건(계약 형태·보수·원격 여부·한국 근무 가능 여부)을 비교 가능한 표로 보여 주는 개인화 공고 탐색 서비스입니다.

- 채용 사이트 (원문 링크) / 개인 계정, 문서, 저장 공고 모두 해당 사용자에게만 공개
- 문서 분석은 기본적으로 규칙 기반. AI 분석은 API 키가 설정된 경우 사용자 별도 동의 후 선택 가능
- 로그인: ChatGPT 계정 (링크를 받은 사용자만 가능한 테스트 배포)

## 주요 기능

| 기능                | 설명                                                                                                                                         |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 이력서 업로드       | PDF / DOCX / 텍스트 (`pdfjs-dist`, `mammoth`)                                                                                                |
| 프로필 추출 및 편집 | 기술·언어·경력·학력 + 검색 키워드 분류(직무/기술/언어/제외)                                                                                  |
| 자연어 근무 조건    | 문장 → 원격·국가·계약형태·주당 시간 규칙 해석                                                                                                |
| 공고 검색           | Welo Global(Lever), Coupang(Greenhouse), Mercor(Ashby) 공개 보드                                                                             |
| 매치 점수           | 직무/기술/언어/경력/근무조건 가중 합산 + 일치·미확인 근거 표시                                                                               |
| 저장/필터/정렬      | 보수 단위·통화·한국 근무·게시일·매치순(기본)                                                                                                 |
| 새 공고 확인        | 이전에 완료된 동일 프로필 검색과 이번 검색 비교(앱 안에서 확인)                                                                              |
| 출처 문구 주의      | 금전 요구 표현을 근거와 함께 표시하며 사기 여부를 판정하지 않음                                                                              |
| LinkedIn URL        | 사용자 프로필 링크만 저장. 자동 수집·분석은 하지 않음                                                                                        |
| 개인 공고 품질 평가 | 본인 검색 공고의 관련성·한국 근무·보수·언어 판단 기록, 버전별 집계 및 선택적 CSV/JSON 내보내기. 다른 사용자에 대한 정답이나 사기 판정이 아님 |

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

| 스크립트                    | 설명                                                            |
| --------------------------- | --------------------------------------------------------------- |
| `npm run dev`               | 개발 서버                                                       |
| `npm run build`             | tsc 검사 + Vite client + esbuild server 번들                    |
| `npm test`                  | 로컬 D1/R2 공유 저장소 충돌을 막기 위해 테스트 파일을 순차 실행 |
| `npm run lint` / `lint:fix` | ESLint 검사/자동 수정                                           |
| `npm run format`            | Prettier 정렬                                                   |
| `npm run db:generate`       | Drizzle 마이그레이션 생성                                       |

## 환경 변수

로컬 개발 변수는 `.env.example`과 `.dev.vars.example`을 참고하세요. Worker 비밀키는 `.dev.vars`에 설정하며 git에 추가하지 마세요. `OPENAI_API_KEY`가 없으면 규칙 기반 분석만 사용합니다. 키가 있어도 사용자가 텍스트의 외부 전송에 별도로 동의한 경우에만 AI 분석을 요청합니다. AI 요청은 `store: false`로 전송하지만 API 측 악용 모니터링 로그에는 별도 보관 정책이 적용될 수 있습니다.

분석할 때는 추출 텍스트와 프로필 저장에 동의해야 합니다. PDF/DOCX **원본 보관은 별도 선택**이며 기본값은 저장하지 않음입니다. 사용자가 원본 삭제·전체 데이터 삭제를 선택할 수 있습니다. 운영 배포 시에는 Sites 인증 헤더 보호와 실제 D1/R2 바인딩을 확인해야 합니다.

**검색 범위:** 현재 연결된 회사 공개 채용 보드의 공고만 조회합니다. 결과는 조회 당시 확인한 정보이고 회사의 실제 채용 진행, 한국에서의 근무 자격 또는 지급을 보증하지 않습니다. 서버는 원본 이력서를 채용 보드로 전송하지 않습니다. 자동 이메일/푸시 알림은 아직 제공하지 않으며, 새 공고 확인은 사용자가 다시 검색할 때에만 이뤄집니다.

**수동 품질 검수:** 앱의 '내 공고 품질 평가'에서 본인의 검색 결과를 개별 평가합니다. 평가는 본인 계정에만 저장되며 전체 데이터 삭제 시 함께 삭제됩니다. 평가를 CSV/JSON으로 내보낼 때 개인 메모는 기본 제외됩니다. 점수·평가 통계는 소수의 개인 평가에 기초한 참고치이며, 전체 추천 품질을 검증했다고 뜻하지 않습니다.

## 문서

| 문서                                                                               | 내용                                                               |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| [docs/PRD.md](docs/PRD.md)                                                         | 제품 요구사항 초안 · 사용자 흐름 · 스키마 · 로드맵                 |
| [docs/SOURCE_TRUST_AND_INGESTION.md](docs/SOURCE_TRUST_AND_INGESTION.md)           | 공고 수집 방식과 출처·지급 신뢰도 표시 설계                        |
| [docs/IMPLEMENTATION_PLAN_2026-09-21.md](docs/IMPLEMENTATION_PLAN_2026-09-21.md)   | 확인된 결함 수정·신규 기능·배포 전 검증 계획                       |
| [docs/NEXT_STAGE_EXECUTION_2026-09-21.md](docs/NEXT_STAGE_EXECUTION_2026-09-21.md) | 다음 단계(A 운영 검증·B 수동 평가·C ATS 공통화) 산출물과 수락 조건 |
| [docs/RELEVANCE_REVIEW_PROTOCOL.md](docs/RELEVANCE_REVIEW_PROTOCOL.md)             | 실제 공고 표본 수동 검수와 검색 품질 지표 산출 기준                |
| [docs/OPERATIONS_RUNBOOK.md](docs/OPERATIONS_RUNBOOK.md)                           | 로컬 인증 경계·D1/R2 비파괴 백업/복원·운영 배포 검증 절차          |
| `docs/INITIAL_SEARCH_PROFILE.md` (로컬 전용)                                       | 개인화 검색 검증 자료. 개인 정보 포함으로 Git 미추적               |

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
  ats/index.ts          # Lever/Greenhouse/Ashby 출처 설정·응답 검증
  evaluation.ts         # 개인 수동 평가 검증·저장·집계·안전한 내보내기
  relevance.ts          # 매치 점수 산정
  ai.ts                 # 사용자 선택형 API 의미 분석
  safety.ts             # 공고의 명시적 금전 요구 표현 탐지
db/schema.ts            # D1 스키마 (Drizzle)
tests/                  # node:test 기반 테스트
docs/                   # 제품/출처 신뢰도 문서
```

## 라이선스

라이선스가 명시되지 않은 사설 프로젝트입니다.
