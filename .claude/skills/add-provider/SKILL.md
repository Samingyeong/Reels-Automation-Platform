---
name: add-provider
description: 외부 API(LLM 대본, 장면 영상 생성, TTS, 자막 정렬, Instagram 발행, 성과 조회, 렌더) 연동을 새로 추가하거나 교체할 때 사용. provider 인터페이스 구현, 계약 테스트, registry 등록, 환경변수 문서화 절차.
---

# Provider 추가

## 절차

1. 인터페이스 확인: `src/providers/types.ts`. 인터페이스 변경이 필요하면 멈추고 계약 변경 절차(docs/06)를 따른다.
2. 공식 문서 확인. LLM 이면 `claude-api` skill 로 최신 모델 ID·SDK 사용법 확인. 문서 URL 을 파일 상단 주석에 남긴다.
3. 구현 위치: `src/providers/<provider-name>/index.ts` (서버 전용, `"use client"` 금지).
   - `name` 은 `<vendor>-<role>[-<model>]` 형식, 결과에 영향을 주는 설정 포함.
   - 키는 생성자 인자로 받는다 (`process.env` 직접 읽기는 registry 에서만).
   - HTTP 429/5xx/타임아웃 → `ProviderError({ retryable: true })`, 4xx·정책 위반 → `retryable: false`.
   - 비동기 작업형 API 는 `start` 에서 `processing + externalJobId` 반환, 폴링은 `poll`.
   - 실제 결과물이 없으면 성공을 반환하지 않는다.
4. 테스트: `src/providers/<name>/<name>.test.ts`
   - 실제 네트워크 호출 금지. `fetch` 를 주입/모킹하고 공식 문서 예시 응답을 fixture 로.
   - 성공, 재시도 가능 오류, 재시도 불가 오류, 스키마 불일치 응답(→ 실패) 케이스.
5. `src/providers/registry.ts` 에 live 분기 추가. 필수 키가 없으면 시작 시 명확한 에러.
6. `.env.example` 에 변수 추가 (서버 전용, `NEXT_PUBLIC_` 금지).
7. `docs/05-providers.md` 표에 비용·약관·출력물 상업적 이용 가능 여부 기록.
8. `npm run ci`.

## 실호출 검증
유료 API·Instagram 실호출은 사용자 승인 후 로컬에서 수동으로만. 결과를 PR 설명에 기록한다.
