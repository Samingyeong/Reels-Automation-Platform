# Reels Automation Platform

AI 숏폼 콘텐츠 제작 및 Instagram Reels 자동 예약 발행 서비스.

주제 입력 → AI 대본 → **승인** → 장면별 영상 생성 → **승인** → AI 나레이션·자막 → 최종 미리보기 **승인** → MP4 자동 렌더(Storage) → 예약 → Instagram 자동 발행 → 성과 수집.

> 현재 단계: **M0 (기반·공통 계약)**. 전체 계획은 [docs/06-work-plan.md](docs/06-work-plan.md).

## 시작하기

```bash
npm install
cp .env.example .env.local
npm run dev        # http://localhost:3000 — Mock 미리보기
npm run remotion   # Remotion Studio (Reel 컴포지션)
npm run ci         # lint + typecheck + test + build
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
| [07-test-deploy](docs/07-test-deploy.md) | 테스트·CI·배포 |

## 기반

[remotion-dev/template-next-app-dir-tailwind](https://github.com/remotion-dev/template-next-app-dir-tailwind) (Remotion 공식 Next.js 템플릿)에서 시작했다. Remotion 은 [Remotion License](https://www.remotion.dev/docs/license) 를 따르며 일정 규모 이상의 회사는 Company License 가 필요하다.
