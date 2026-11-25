# 05. Provider 추상화

인터페이스: [`src/providers/types.ts`](../src/providers/types.ts) · Mock: [`src/providers/mock`](../src/providers/mock/index.ts) · 선택: [`src/providers/registry.ts`](../src/providers/registry.ts)

## 1. 인터페이스

| Provider | 메서드 | 비고 |
| --- | --- | --- |
| `ScriptProvider` | `generateScript(ScriptInput) → Script` | 결과는 반드시 `Script.parse` 통과 |
| `SceneVideoProvider` | `start(req) → processing/completed/failed`, `poll(externalJobId)` | 비동기 API 대응. `external_job_id` 를 DB 에 저장해 워커 재시작 후 폴링 재개 |
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

## 3. 새 provider 추가 절차

`.claude/skills/add-provider/SKILL.md` 참조. 요약: 인터페이스 구현 → 계약 테스트(mock 과 동일 테스트 스위트) → registry 등록 → env 문서화 → 이 문서 표에 비용·약관·상업적 이용 가능 여부 기록.

## 4. 등록된 provider

| 역할 | name | 모드 | 상태 | 비용/약관 메모 |
| --- | --- | --- | --- | --- |
| 대본 | `mock-script` | mock | ✅ | – |
| 장면 영상 | `mock-scene-video` | mock | ✅ placeholder (Remotion 이 색 배경 렌더) | – |
| 나레이션 | `mock-speech` | mock | ✅ 오디오 없음, 길이 추정 | – |
| 자막 | `mock-caption` | mock | ✅ 단어 길이 비례 타이밍 | – |
| 발행 | `mock-publisher` | mock | ✅ 실제 게시 안 함, permalink 없음 | – |
| 성과 | `mock-insights` | mock | ✅ 빈 결과 | – |
