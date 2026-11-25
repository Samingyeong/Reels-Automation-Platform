# Reels Automation Platform

AI 숏폼 콘텐츠 제작 및 Instagram Reels 자동 예약 발행 서비스.

주제 입력 → AI 대본 → **승인** → 장면별 영상 생성 → **승인** → AI 나레이션·자막 → 최종 미리보기 **승인** → MP4 자동 렌더(Storage) → 예약 → Instagram 자동 발행 → 성과 수집.

> 현재 단계: **M2 완료 (Mock provider 로 대본 → 장면 → 나레이션·자막 → MP4 렌더까지 웹 스튜디오에서 검수)**. 전체 계획은 [docs/06-work-plan.md](docs/06-work-plan.md), 결정 기록은 [docs/decisions.md](docs/decisions.md).

## 시작하기

```bash
npm install -g npm@11.21.3   # npm 10 은 이 의존성 트리에서 install 버그가 있음 (DR-006)
npm install
npm run db:start             # 로컬 Supabase (Docker 필요)
npm run env:local            # .env.local 생성 (로컬 Supabase 키, Mock provider, inline 작업 실행)
npm run build && npm start   # http://localhost:3000 → 가입 → 주제 입력
npm run test:e2e             # Playwright 로 전체 흐름 검증
npm run test:integration     # 로컬 Supabase 통합 테스트
npm run ci                   # lint + typecheck + test + build
```

## 문서

| 문서 | 내용 |
| --- | --- |
| [00-research](docs/00-research.md) | 오픈소스·공식 문서 조사, 라이선스, 재사용 범위 |
| [01-architecture](docs/01-architecture.md) | 구성, 흐름, 멱등성, 보안 |
| [02-db-schema](docs/02-db-schema.md) | 테이블, 해시, RLS |
| [03-state-machine](docs/03-state-machine.md) | 상태 전이, 승인 초기화 규칙 |
| [04-api-spec](docs/04-api-spec.md) | REST API, Trigger.dev 태스크 계약 |
| [05-providers](docs/05-providers.md) | 외부 API 추상화, Mock |
| [06-work-plan](docs/06-work-plan.md) | 마일스톤, 이슈, 파일 소유권 |
| [07-test-deploy](docs/07-test-deploy.md) | 테스트·CI·배포, 검증 기록 |
| [decisions](docs/decisions.md) | 결정 기록 (DR-001~014) |

## 기반

[remotion-dev/template-next-app-dir-tailwind](https://github.com/remotion-dev/template-next-app-dir-tailwind) (Remotion 공식 Next.js 템플릿)에서 시작했다. Remotion 은 [Remotion License](https://www.remotion.dev/docs/license) 를 따르며 개인·3인 이하 조직은 무료이며 이 프로젝트는 무료 라이선스로 진행한다 ([DR-001](docs/decisions.md#dr-001-remotion-무료-라이선스-사용)).
