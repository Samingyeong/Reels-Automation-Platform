# 09. Trigger.dev 배포 차단 조사 + 대체 워커(Railway) 비교 (2026-11-25)

> 상태: **조사·비교만**. 기술 스택 변경·유료 결제는 하지 않았다 (사용자 지시).

## 1. "Deployments are not available for this organization" 조사

### 1.1 발생 조건 (Trigger.dev 오픈소스, `triggerdotdev/trigger.dev@e0e60ff`, 2026-11-25)
- 메시지 정의: `apps/webapp/app/v3/deploymentAccess.server.ts` 의 `DEFAULT_DENIED_MESSAGE`. `DeploymentAccessError` 는 **HTTP 403**.
- `initializeDeployment.server.ts` 가 배포 초기화 시 `checkDeployAccess({ stage: "initialize", organizationId, projectId, environmentId, contentHash, hasGitMetadata, triggeredVia, cliVersion })` 를 호출하고, 결과가 `{ allowed:false, kind:"denied" }` 이면 이 메시지로 거부한다.
- 판단 주체는 **비공개 플러그인 `@triggerdotdev/plugins/deployment-access`** (Trigger.dev Cloud 에서만 로드). 입력: 조직 결제 상태(`paying | non_paying | unknown`), 조직별 sliding-window 카운터(1h/1d), 조직 override. 플러그인이 예외를 던져도 "denied"(fail-closed) 로 같은 메시지가 나온다.
- **카드 인증 게이트와는 별개**: 카드 미인증이면 `cardVerificationDeployGate.server.ts` 의 다른 메시지("Unlock your Free tier credits to deploy… Add a card: …")가 나온다. 지금은 기본 메시지 → 카드 단계는 통과했거나 그 전 단계(플러그인 정책)에서 막힘.
- 즉 원인은 사용자 측 설정·코드로 확인할 수 없는 **조직 단위 정책 결정**(남용 방지 정책, 신규 조직 제한, override, 또는 플러그인 내부 오류)이며 Trigger.dev 만 확인 가능하다.

### 1.2 인증 문제 vs 배포 권한 문제 (API 직접 호출, 비밀 값은 마스킹)
| 호출 | 결과 | 의미 |
| --- | --- | --- |
| `GET /api/v2/whoami?projectRef=…` (개인 토큰) | **200**, 조직 "Reels Studio", 프로젝트 일치 | 계정 인증 정상 |
| `GET /api/v1/projects/{ref}/prod` (개인 토큰) | **200**, prod 키 발급됨 | 프로젝트 권한 정상 |
| 배포 파일 업로드 (CLI, artifact) | 성공 | prod 키 인증 정상 |
| `POST /api/v1/deployments` (prod 키) | **403** `{"error":"Deployments are not available for this organization.","code":"DEPLOYMENT_ACCESS_DENIED"}` | **배포 권한(조직 정책) 문제** |

→ 계정 인증 문제가 아니다.

### 1.3 Hello World 분리 테스트
- 별도 디렉터리에 의존성 `@trigger.dev/sdk@4.8.10` 만 있는 태스크 1개(`hello-world`)를 같은 프로젝트로 배포 → **동일 403**. 번들 1.61MB (본 프로젝트 9.58MB).
- 플러그인은 코드 내용이 아니라 조직·환경 정보로 판단하므로 결과와 일치 → **프로젝트 코드 문제 아님, 조직 문제**.
- dev 환경 등록(`trigger.dev dev`)은 정상 — 작업 3개 등록.

### 1.4 상태 페이지
- 이 개발 환경 네트워크 정책상 `status.trigger.dev` 접근 불가(프록시 403) → **미확인**. 사용자 확인 필요: https://status.trigger.dev

### 1.5 고객지원 문의 정보 (복사용)
```
Subject: Deploys rejected with DEPLOYMENT_ACCESS_DENIED on Free plan (card verified)

Org: "Reels Studio" (slug: reels-studio-bb00)
Project: reels-automation-platform (proj_gfzoitqgsbflkfxmmhys), environment: prod
Plan: Free. Card added for verification; Billing page shows no warnings.
CLI: trigger.dev 4.8.10 (Node 22, Linux), also tried --native-build.

POST /api/v1/deployments -> HTTP 403
{"error":"Deployments are not available for this organization.","code":"DEPLOYMENT_ACCESS_DENIED"}

- whoami and GET /api/v1/projects/{ref}/prod both return 200 (auth is fine).
- Artifact upload succeeds; the failure is at "Failed to initialize deployment".
- A minimal one-task hello-world project fails the same way, so it is not project code.
- Dev environment works (`trigger.dev dev` registers tasks).
- The message is the generic DEFAULT_DENIED_MESSAGE, not the card-verification message,
  so it looks like the deployment-access policy is denying this org.
Could you check the deployment access decision / override for this org?
First failure: 2026-11-25 (UTC). Several attempts since, all identical.
```

## 2. 대체안: Railway Docker 워커

### 2.1 재사용 구조
현재 작업 실행은 이미 DB 큐(outbox `jobs`) 중심이라 Trigger.dev 는 "전달자"일 뿐이다.

| 기능 | 현재 구현 | Railway 워커에서 |
| --- | --- | --- |
| 작업 큐 | `jobs` 테이블 + `claim_job`(lease, SKIP LOCKED) | **그대로** |
| 재시도 | `release_job_for_retry` 가 `run_after` 설정 | **그대로** (워커가 `run_after` 지난 작업을 폴링) — Trigger delay 재전달 불필요 |
| 중복 방지 | `jobInputKey`, lease, 장면 단위 RPC | **그대로** (Trigger 멱등 키만 사용 안 함) |
| 작업 로직 | `runJob()` (`src/server/jobs/runner.ts`) | **그대로** |
| 렌더 | `.remotion-bundle` + `@remotion/renderer` | **그대로**, Docker 이미지에 Chromium 의존성 |
| 남은 작업 회수 | `sweep-outbox` 스케줄 + `list_dispatchable_jobs` | 워커 루프가 같은 RPC 를 상시 폴링 → 별도 스케줄 불필요 |

### 2.2 변경 파일
| 파일 | 변경 |
| --- | --- |
| `src/worker/main.ts` (신규, 약 60줄) | 루프: `list_dispatchable_jobs` → `runJob()` (동시 실행 1~2, 렌더 1). 대기 2~5초, SIGTERM 시 현재 작업 마치고 종료 (lease 로 안전) |
| `Dockerfile.worker` (신규) | `node:22-bookworm-slim` + Remotion Linux 의존 패키지(현재 `trigger.config.ts` aptGet 목록 재사용) + `npx remotion browser ensure` + `.remotion-bundle` |
| `railway.json` (신규) | Dockerfile 경로, 재시작 정책 |
| `src/server/env.ts` | `JOB_DISPATCH_MODE=queue` 추가, cloud 에서 `trigger` 또는 `queue` 허용 (조용한 inline 대체 금지 규칙 유지) |
| `src/server/http.ts` | `queue` → `NoopDispatcher` (워커가 폴링) |
| `src/server/env.test.ts`, 워커 루프 단위 테스트, CI 에 Docker 빌드 | 추가 |
| 변경 없음 | `runner.ts`, `project-service.ts`, 마이그레이션·RPC, 렌더러, providers, UI. `src/trigger/*` 는 남겨 두고 환경변수로 선택 |

예상 작업량: 0.5~1일 (Docker 이미지 렌더 검증 포함).

### 2.3 비용 (월, 공식 문서 기준)
가정: 워커 상시 실행 유휴 RAM 약 0.2GB, 렌더 1편 2 vCPU·2GB·90초, 기타 작업은 무시할 수준.

| | Trigger.dev Free (현재 계획) | Railway Hobby | Railway Free |
| --- | --- | --- | --- |
| 기본료 | $0 (카드 인증) | **$5/월** (사용량 $5 포함) | $0, 월 $1 크레딧 |
| 상시 비용 | 없음 (sweep 10분·micro ≈ $0.1) | 유휴 0.2GB × $10/GB = 약 $2 | 서비스당 RAM 0.5GB 상한 → **Chromium 렌더 불가 가능성 높음** |
| 렌더 30편 / 90편 | 약 $0.9 / $2.8 (large-1x $0.00034/s) | 약 $0.1 / $0.2 (vCPU $0.000463/분, GB $0.000231/분) | – |
| 합계 30편 / 90편 | **$1~3 (무료 범위)** | **$5 (포함 사용량 내)** | 사용 불가에 가까움 |

Railway 단가: [Pricing](https://docs.railway.com/pricing), [Plans](https://docs.railway.com/pricing/plans), [Free plan](https://docs.railway.com/pricing/free-plan). 신규 계정 30일 체험 $5 1회 제공. Railway 상업적 이용 조건은 **미확인**.

### 2.4 운영 복잡성
| 항목 | Trigger.dev | Railway 워커 |
| --- | --- | --- |
| 배포 | `trigger deploy` (현재 차단) | GitHub 연동 자동 배포 또는 `railway up` |
| 실행 이력·로그 UI | 작업별 run 화면, 재실행 버튼 | 서비스 로그만 (작업 상태는 우리 DB/스튜디오) |
| 스케일 | 작업별 머신 크기 자동 (render 만 large) | 워커 1개 크기 고정, 렌더 동시성 직접 제한 |
| 장애 시 | 플랫폼 재시도 + 우리 DB 재시도 | 컨테이너 재시작 + lease 만료 회수 (이미 구현) |
| 지연 | 트리거 즉시 실행 | 폴링 간격(2~5초) |
| 종속성 | Trigger SDK·빌드 확장 | 표준 Docker (이식성 높음: Fly.io·Cloud Run 등으로 이동 쉬움) |

### 2.5 권고
1. 우선 Trigger.dev 지원팀 답변을 기다린다(§1.5). 비용·운영 면에서 현재 설계가 가장 유리.
2. 2~3일 내 해결이 안 되면 Railway Hobby($5/월) 워커로 전환을 **사용자 승인 후** 진행. 코드 변경은 위 표의 신규 3파일 + 설정 2파일로 제한되고, 큐·재시도·중복 방지·렌더러는 그대로 재사용한다.
