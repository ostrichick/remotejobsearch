# RoleScout 이력서 검색 QA 벤치마크 - 2026-09-26

- 테스트 커밋: `45ed9f6c017f41fff11ad70f6c20a5595e8d3b6d` (현재 배포된 Sites 버전 6과 동일 코드)
- 실행 방식: 격리된 local Sites dev 환경 + 새 local D1 + 실제 현재 ATS 피드(Welo Global/Lever, Coupang/Greenhouse, Mercor/Ashby)
- 이력서 분석: 규칙 기반, AI 분석 비활성
- 운영 사용자 데이터: 건드리지 않음. 별도 worktree와 별도 local D1에서 실행
- 캡처: 각 시나리오에서 실제 RoleScout 검색 결과 UI를 캡처. 가독성을 위해 첫 12개 표시 행까지만 캡처

## 왜 가상 이력서를 사용했나

인터넷의 공개 이력서 예시에서 직무, 스킬, 언어 섹션의 구조만 참고하고 실제 사람의 연락처나 개인 이력서를 복사하지 않았다. 참고한 공개 예시 유형은 Wozber Data Annotator, WriteCV Translator, Resume Worded Language Specialist, Monster Data Annotator 등이다.

## 결론

최근 수정한 **공고 제목 언어 필터 자체는 잘 동작했다.** 7개 시나리오에서 검색 결과가 프로필에 없는 언어를 제목 필수조건으로 요구한 사례는 0건이었다.

다만 end-to-end 테스트에서는 중요한 문제가 확인됐다.

1. **P0 - 이력서 언어 추출과 공고 제목 언어 판정의 사전이 서로 다르다.** Norwegian-English 이력서에서 Norwegian을 자동 추출하지 못했다. 그 결과 실제로 노르웨이어를 할 수 있는 사용자도 Norwegian 공고에서 제외된다.
2. **P1 - 일반 전문직 role 분류가 부족하다.** Data Analyst와 Frontend Developer 이력서는 스킬은 추출되지만 `primaryRoleKeywords`가 비어 있다. 따라서 정확히 맞는 공고가 있어도 점수가 44점 이하로 제한되어 기본 화면에서 전부 숨겨진다.
3. **P1 - 언어 전문직 랭킹이 지나치게 일반적이다.** Spanish/French 전문 이력서에서도 generic English QA/Audio Rater 공고가 상단을 차지했다. 첫 Spanish 제목 공고는 표시 순위 17위, 첫 French 제목 공고는 15위였다.
4. **P2 - 같은 프로젝트의 국가별 변형이 첫 화면을 과도하게 차지한다.** 동일한 Welo 프로젝트가 US, UK, Canada, Australia 등으로 반복되어 검색 다양성이 떨어진다.

따라서 현재 RoleScout은 **AI 평가, annotation, language-rater 계열에서는 꽤 보수적으로 잘 작동하지만, 범용 remote job 검색기로 보기에는 아직 role parser와 ranking 보강이 필요하다.**

## 시나리오 요약

| ID  | 가상 이력서                                  | 자동 추출 언어           | 기본 화면 표시 결과 | 미보유 언어 위반 | 핵심 관찰                                                       |
| --- | -------------------------------------------- | ------------------------ | ------------------: | ---------------: | --------------------------------------------------------------- |
| P01 | Korean-English-Spanish AI Evaluator          | Korean, English, Spanish |                  89 |                0 | Korean 9위, Spanish 19위                                        |
| P02 | Spanish-English Translator & Localization QA | English, Spanish         |                  72 |                0 | 첫 Spanish 공고 17위                                            |
| P03 | English Data Annotator                       | English                  |                  44 |                0 | 핵심 직무 1위부터 정상 노출                                     |
| P04 | Korean-English Data Analyst                  | Korean, English          |                   0 |                0 | `primaryRoleKeywords` 비어 있음, 정확한 Data Analyst도 44점 low |
| P05 | English Frontend Developer                   | English                  |                   0 |                0 | 개발 스킬은 추출되지만 role 분류가 없어 전부 low                |
| P06 | French-English Linguist                      | English, French          |                  74 |                0 | 첫 French 공고 15위                                             |
| P07 | Norwegian-English Linguist                   | English만 추출           |                  59 |                0 | Norwegian 추출 실패, Norwegian 공고는 전부 제외                 |

> `backend results`에는 low 점수 후보도 들어가지만, 기본 UI는 low 결과를 숨긴다. 그래서 P04/P05는 backend 후보가 존재해도 기본 화면에는 0건으로 표시된다.

## 상세 결과

### P01 - Korean / English / Spanish AI Evaluator

- Korean, English, Spanish와 evaluation/annotation 관련 스킬이 정상 추출됨.
- medium/high 89건 표시.
- 제목 언어 위반 0건.
- Korean 전용 공고는 표시 순위 9위, Spanish 전용 공고는 19위.
- 첫 화면이 여러 국가의 동일 English QA Audio Rater 프로젝트로 채워져 언어 특화 공고가 밀림.
- 캡처: `screenshots/P01.png`

### P02 - Spanish / English Translator & Localization QA

- Spanish, English 정상 추출.
- medium/high 72건 표시.
- 제목 언어 위반 0건.
- 첫 Spanish 제목 공고는 17위.
- 캡처 첫 12개는 English/general QA 역할이 대부분이다.
- 현재 점수는 프로필 언어 중 하나라도 일치하면 동일한 language bonus를 주기 때문에, 이력서의 특징적인 전문 언어를 충분히 우선하지 못한다.
- 캡처: `screenshots/P02.png`

### P03 - English Data Annotator

- English, annotation, evaluation, QA가 정상 추출됨.
- medium/high 44건 표시.
- 상위 10개가 annotation/evaluation/rater 계열로 잘 정렬됨.
- 제목 언어 위반 0건.
- 이번 테스트에서 가장 명확한 positive control 결과.
- 캡처: `screenshots/P03.png`

### P04 - Korean / English Data Analyst

- `data analysis`, Python, SQL, AWS, Excel은 정상 추출됨.
- 그러나 `primaryRoleKeywords`는 비어 있음.
- 실제 backend 결과의 1위에는 `Senior Data Analyst`가 있었지만 44점 low로 분류됨.
- backend 후보 150건이 있었지만 기본 화면 표시 결과는 **0건**.
- 현재 시스템이 언어/annotation 계열 외 일반 데이터 직무까지 지원하려면 명백한 false-negative 한계다.
- 캡처: `screenshots/P04.png`

### P05 - English Frontend Developer

- JavaScript, TypeScript, React, AWS, design은 정상 추출됨.
- `primaryRoleKeywords`는 비어 있음.
- backend 후보 95건이 있었지만 모두 low여서 기본 화면에는 **0건**.
- 무관한 공고를 공격적으로 노출하지 않는 점은 좋지만, 현재 parser/ranker가 frontend 직무를 실질적으로 지원하지 못한다는 것도 확인된다.
- 캡처: `screenshots/P05.png`

### P06 - French / English Linguist

- French, English 정상 추출.
- medium/high 74건 표시.
- 제목 언어 위반 0건.
- 첫 French 제목 공고는 15위.
- 상단은 generic English QA 공고가 대부분이다.
- 캡처: `screenshots/P06.png`

### P07 - Norwegian / English Linguist

- **확정 버그:** 이력서에 Norwegian이 명시되어 있지만 자동 프로필에는 English만 들어감.
- 공고 제목 언어 필터는 Norwegian을 정상 인식하기 때문에, 반대로 Norwegian 공고가 모두 제외됨.
- 즉 최근 수정은 Norwegian을 모르는 사용자의 오탐은 막지만, Norwegian을 실제로 아는 사용자는 수동으로 언어를 추가하지 않으면 관련 공고를 받을 수 없다.
- 캡처: `screenshots/P07.png`

## 개선 우선순위

1. **P0: 언어 사전을 하나로 통합**
   - `server/profile.ts`의 작은 별도 `terms` 목록을 없애고, 공고 제목 판정과 같은 canonical language dictionary를 재사용한다.
   - Norwegian, Swedish, Danish, Finnish, Ilocano 등 최근 추가 언어가 이력서에서도 추출되는 end-to-end 테스트를 추가한다.

2. **P1: 일반 직무 role 분류 확대**
   - Data Analyst, Data Scientist, Software/Frontend/Backend Engineer, Developer, Product/Project 역할 등을 role group에 포함하거나 이력서의 직함/헤딩에서 primary role을 별도로 추출한다.
   - 지금은 annotation/evaluation/transcription/linguistic 계열 밖의 역할이 `role=0`이 되어 최대 44점으로 제한될 수 있다.

3. **P1: 전문 언어 랭킹 강화**
   - job title의 언어 일치를 본문 언어 언급보다 강하게 본다.
   - 가능하면 이력서의 Native/Fluent 같은 숙련도도 구조화한다.
   - Spanish/French 전문직이 generic English 프로젝트보다 지나치게 아래로 밀리지 않도록 한다.

4. **P2: 동일 프로젝트 국가 변형 다양화**
   - 같은 회사/거의 같은 제목의 국가별 posting은 그룹화하거나 두 번째 이후 항목에 diversity penalty를 준다.

5. **기존 strict title-language exclusion은 유지**
   - 이번 7개 시나리오에서 미보유 제목 언어 위반이 0건이었으므로 이 규칙 자체는 유지할 가치가 있다.

## 산출물

- `results.json` - 시나리오별 원시 측정값과 상위 10개 공고
- `summary.csv` - 시나리오별 핵심 지표
- `resumes/` - 7개 가상 이력서 원문
- `screenshots/` - 7개 실제 RoleScout 검색 결과 화면 캡처
- `benchmark-runner.cjs` - 동일한 격리 local Sites 환경에서 다시 실행할 수 있는 자동화 스크립트

## 테스트 범위의 한계

- 운영 Sites는 브라우저의 실제 ChatGPT 인증 세션이 필요하므로, 이번 자동화는 **현재 배포와 동일한 커밋을 격리 local Sites UI에서 실행**했다.
- ATS 데이터는 테스트 시점의 실제 공개 피드를 사용했다. 따라서 나중에 다시 실행하면 공고 수와 순위 일부는 바뀔 수 있다.
- 이 테스트는 검색/랭킹 품질을 확인한 것이며 합격 가능성이나 채용 적합성을 예측하는 평가가 아니다.
