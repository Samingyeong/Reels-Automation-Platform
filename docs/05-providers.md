# 05. Provider 추상화

인터페이스: [`src/providers/types.ts`](../src/providers/types.ts) · Mock: [`src/providers/mock`](../src/providers/mock/index.ts) · 선택: [`src/providers/registry.ts`](../src/providers/registry.ts)

## 1. 인터페이스

| Provider | 메서드 | 비고 |
| --- | --- | --- |
| 공통 | `info: ProviderInfo`, `estimateCostUsd(req)` | 언어·상업적 이용·async·장면 단위 생성·근거 URL / 호출 전 예상 비용 (생성 계열) |
| `ScriptProvider` | `generateScript(ScriptInput) → Script` | 결과는 반드시 `Script.parse` 통과 (러너가 재검증, 실패 시 재시도 불가 오류) |
| `SceneVideoProvider` | `start(req) → processing/completed/failed`, `poll(externalJobId)` | 비동기 API 대응. `external_job_id` 를 DB 에 저장해 워커 재시작 후 폴링 재개 (M2 구현). `req.variation`: 같은 프롬프트 재생성 시 다른 결과용 seed |
| `SpeechProvider` | `synthesize({text, voiceId, language}) → {audio, durationMs, captions?}` | 타이밍 제공 시 captions 채움 |
| `CaptionProvider` | `align({text, durationMs, audio}) → Caption[]` | Speech 가 타이밍을 주지 않을 때만 사용 |
| `PublisherProvider` | 컨테이너 생성 / 상태 / 게시 / permalink / 한도 | 단계 분리 → 단계별 결과를 DB 에 저장하며 진행 |
| `InsightsProvider` | `getReelInsights(mediaId)` | 응답에 있는 지표만 반환 |
| `RenderProvider` (M3) | `render(props) → mp4` | Trigger.dev 로컬 렌더 / Lambda 교체용 |

## 2. 규칙

1. **서버 전용.** provider 파일은 `"use client"` 모듈에서 import 금지.
2. **에러 분류.** 네트워크·429·5xx → `ProviderError(retryable: true)`; 4xx 입력 오류·콘텐츠 정책 위반 → `retryable: false` (Trigger.dev `AbortTaskRunError`).
3. **이름 고정.** `name` 은 멱등 키의 일부. 모델·보이스 등 결과에 영향을 주는 설정은 `name` 또는 입력에 포함.
4. **가짜 성공 금지.** Mock 도 실제로 존재하지 않는 permalink·성과 수치를 만들지 않는다. Mock 결과는 UI 에 `MOCK` 배지.
5. **모드 스위치.** `PROVIDER_MODE`(생성 계열), `PUBLISH_MODE`(발행) 분리. 미구현 live 는 예외.
6. **비용 기록.** live provider 는 호출당 추정 비용을 반환하거나 워커가 `jobs.cost_estimate_usd` 에 기록.

## 3. 계약 테스트 · Mock 으로 전체 경로 검증

- [`src/providers/contract.ts`](../src/providers/contract.ts): `describeScriptContract`, `describeSceneVideoContract`, `describeSpeechContract`. **모든 provider 가 같은 스위트를 통과**해야 교체 가능. live provider 는 fetch 주입 + 공식 문서 예시 응답 fixture 로 실행 (실호출 금지).
- 비동기 Mock `createAsyncMockSceneVideoProvider({ pollsUntilDone })`: start → processing(externalJobId) → poll → completed. externalJobId 가 입력으로 결정되어 워커 재시작 후 폴링 재개 경로를 테스트할 수 있다.
- 장애 주입: 입력 텍스트에 `[mock:fail-retryable]` → `ProviderError(retryable)`, `[mock:fail-fatal]` → 재시도 불가 오류. 유료 API 없이 재시도·실패 복구를 검증한다.

## 4. 영상·TTS provider 선정 (D-3/D-4, 미확정)

기준·가중치·측정 방법: [decisions.md DR-004](decisions.md#dr-004-장면-영상tts-provider-미확정-평가-기준-고정). 후보 평가 시 아래 표를 채운다. 유료 평가 호출 전 예상 비용 보고·승인 필수(DR-005).

| 후보 | 역할 | 한국어 품질(1-5) | 상업적 이용 | 30초 영상 비용 | 연동 복잡성 | 장면당 p50/p95 | 장면 단위 | 비동기·복구 | 비고·근거 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| (미평가) | 장면 영상 | | | | | | | | |
| (미평가) | TTS | | | | | | | | |

## 5. 새 provider 추가 절차

`.claude/skills/add-provider/SKILL.md` 참조. 요약: 인터페이스 구현 → 계약 테스트(mock 과 동일 테스트 스위트) → registry 등록 → env 문서화 → 이 문서 표에 비용·약관·상업적 이용 가능 여부 기록.

## 6. 등록된 provider

| 역할 | name | 모드 | 상태 | 비용/약관 메모 |
| --- | --- | --- | --- | --- |
| 대본 | `mock-script` | mock | ✅ | – |
| 장면 영상 | `mock-scene-video` | mock | ✅ 동기형 placeholder (Remotion 이 색 배경 렌더) | – |
| 장면 영상 | `mock-scene-video-async` | mock | ✅ 비동기형(start/poll) 모사 | – |
| 나레이션 | `mock-speech` | mock | ✅ 단어 타이밍에 맞춘 톤 WAV(실제 파일 → Storage·재생·렌더 경로 검증), 길이 추정 | – |
| 자막 | `mock-caption` | mock | ✅ 단어 길이 비례 타이밍 | – |
| 발행 | `mock-publisher` | mock | ✅ 실제 게시 안 함, permalink 없음 | – |
| 성과 | `mock-insights` | mock | ✅ 빈 결과 | – |
