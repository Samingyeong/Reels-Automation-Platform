# 08. M3 사전 조사 — 대본·영상·이미지·음성 Provider (2026-11-25)

> **원칙**: 유료 API 는 호출하지 않았다. 가격은 각사 **공식 가격 페이지(검색으로 확인)** 를 우선하고, 제3자 비교 사이트 수치는 "추정"으로 표시한다. 가격은 자주 바뀌므로 실제 선정 직전에 다시 확인하고, 유료 평가 호출 전에는 예상 비용을 보고·승인받는다 (DR-005).
> 이 환경의 네트워크 정책상 대부분 공급사 문서를 직접 열지 못해 웹 검색 결과(공식 도메인 한정 검색 포함)를 근거로 했다. "검증 필요" 항목은 후보 평가(M3-1~3) 때 공식 문서·실측으로 확정한다.

## 1. 요약

| 구분 | 1차 후보 | 이유 | 비고 |
| --- | --- | --- | --- |
| 대본 | **Claude Opus 5.5** (`claude-opus-5-5`) | 공식 기본 모델, 구조화 출력(JSON)으로 `Script` 스키마 강제 | 편당 약 $0.07. 더 싼 모델(Sonnet 5.5 약 $0.035, Haiku 5.5 약 $0.002)은 품질 평가 후 사용자 결정 |
| 영상 방식 | **C. 혼합 (이미지+모션 기본, 훅·핵심 장면만 AI 영상)** | 비용 대비 품질·움직임 균형, 장면 단위 교체가 쉬움 | 저비용 운영은 A, 고품질은 B 를 설정으로 선택 |
| 이미지 | Imagen 4 / 4 Fast, Gemini 3.1 Flash Image, FLUX.2, Seedream | 장당 $0.02~0.07 | 한국어 프롬프트보다 영어 프롬프트 권장(대본 LLM 이 영어 visualPrompt 생성) |
| 영상 | Runway Gen-4 Turbo, Kling, Veo 3.1, Sora 2 | 초당 $0.05~0.20 | 모두 비동기 작업형 → 기존 `start/poll` 인터페이스로 수용 |
| 음성(TTS) | **Google Chirp 3 HD** (저비용·월 100만 자 무료) vs **ElevenLabs** (품질·타임스탬프) | 30초 나레이션 약 240자 → 편당 $0.007~0.02 | 한국어 품질은 공개 벤치마크로 우열이 갈리지 않음 → **블라인드 청취 테스트로 결정** |
| 무료 대체 | Pexels 스톡 영상 (상업적 무료, 200회/시간) | 비용 0 | 주제 적합도 낮을 수 있음. 실사 B-roll 보조용 |

## 2. 영상 제작 방식 비교

| | A. AI 이미지 + Remotion 모션 | B. AI 동영상 | C. 혼합 |
| --- | --- | --- | --- |
| 방식 | 장면마다 이미지 1장 → Remotion 으로 줌·팬(Ken Burns)·전환·자막 | 장면마다 5~10초 AI 영상 | 대부분 이미지+모션, 첫 장면(훅)·핵심 1~2장면만 영상 |
| 30초 1편 예상 | **$0.3~0.7** | $2.4~9.1 | **$1.0~3.5** |
| 60초 1편 예상 | $0.5~1.4 | $4.7~18.2 | $1.6~5.6 |
| 생성 시간 | 장면당 수 초 | 장면당 수십 초~수 분 (비동기) | 중간 |
| 장면 단위 재생성 | 매우 쉬움·저렴 | 가능하나 비쌈 | 쉬움 (영상 장면만 비쌈) |
| 품질·몰입도 | 정적 느낌, 정보형 콘텐츠에 적합 | 가장 역동적, 결과 편차 큼 | 첫 3초 이탈 방지(훅)에 영상 투입 |
| 실패·복구 | 동기에 가까워 단순 | 작업 ID 폴링·타임아웃 처리 필수(구현 완료) | 둘 다 |
| 현재 코드 | `SceneVisual.image` 지원, **모션 효과 추가 필요** | `SceneVideoProvider` start/poll 구현 완료 | 장면별 방식 지정 필요 |

- 비용 가정: 장면 5초, 30초=6장면·60초=12장면, 한국어 나레이션 초당 약 8자, 시각물 재생성 여유 1.5배, 대본 $0.07, 렌더 약 $0.03(측정 전 추정), TTS 는 ElevenLabs 가격(비싼 쪽). 등급(low/mid/high)은 아래 단가표의 저·중·고 후보.

### 월간 예상 비용 (영상 제작 API 만, 인프라 제외)

| 방식·등급 | 30초 × 30편 | 30초 × 60편 | 30초 × 90편 | 60초 × 30편 | 60초 × 60편 | 60초 × 90편 |
| --- | --- | --- | --- | --- | --- | --- |
| A low (Imagen 4 Fast $0.02/장) | $9 | $19 | $28 | $16 | $31 | $47 |
| A mid ($0.04/장) | $15 | $29 | $44 | $26 | $53 | $79 |
| A high (Gemini 3.1 Flash Image $0.067/장) | $22 | $44 | $66 | $41 | $82 | $123 |
| **C low** (이미지 $0.02 + Gen-4 Turbo $0.05/초) | **$30** | **$60** | **$90** | $47 | $93 | $140 |
| C mid ($0.04 + $0.10/초) | $56 | $112 | $168 | $88 | $177 | $265 |
| C high ($0.067 + $0.20/초) | $106 | $212 | $318 | $167 | $334 | $501 |
| B low (Gen-4 Turbo $0.05/초) | $71 | $143 | $214 | $140 | $279 | $419 |
| B mid ($0.10/초: Sora 2 720p 등) | $139 | $278 | $417 | $275 | $549 | $824 |
| B high ($0.20/초: Veo 3.1 등) | $274 | $548 | $822 | $545 | $1,089 | $1,634 |

인프라(별도): Trigger.dev 무료 크레딧 월 $5 (렌더 large-1x $0.00034/초), Supabase 무료(파일 1GB — **월 90편 × 실제 영상 10~15MB 는 1GB 초과** → 발행 후 중간 산출물 정리 또는 Pro $25/월), Vercel Hobby 는 상업적 이용 불가(수익화 시 Pro $20/월부터). 상세는 §6.

## 3. 단가표

### 3.1 영상 생성 API (초당, 별도 표기 없으면 720p)
| 모델 | 가격 | 근거 | 비고 |
| --- | --- | --- | --- |
| Runway Gen-4 Turbo | 5 credits/초 = **$0.05/초** (최소 $0.10/회) | [Runway API Pricing (공식)](https://docs.dev.runwayml.com/guides/pricing/), [dev.runwayml.com/pricing](https://dev.runwayml.com/pricing) | image-to-video (이미지 필요) → 혼합 방식과 궁합 |
| Runway Gen-4.5 | 12 credits/초 = $0.12/초 | 동일 | |
| Kling 4.0 (직접) | 720p 1.0 unit/초, 1080p 1.5 unit/초, 패키지 단가 약 $0.15/unit → 약 $0.15/초 | [Kling API Pricing (공식)](https://klingai.com/global/dev/pricing) | 선불 패키지 180일 만료 |
| Kling 4.0 (Runway 경유) | 15.7 credits/초 (720p), 11/30까지 20% 할인 | [Runway Kling 3.0 API](https://dev.runwayml.com/learn/kling-3-0-api) | 단일 API 키로 여러 모델 |
| Sora 2 (OpenAI) | $0.10/초 (720p) | [OpenAI Pricing (공식)](https://developers.openai.com/api/docs/pricing.md) | 제3자 글에 API 종료설 있음 → **검증 필요** |
| Veo 3.1 (Google) | 영상만 $0.20, 오디오 포함 $0.40 (720p/1080p), Fast·Lite 더 저렴 | [Google Cloud 가격표 (공식)](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing?hl=en) | 표의 단위가 "per count"로 표기 → **초당 여부 검증 필요**. 제3자는 Veo 3.1 Lite 약 $0.03/초로 기재 |
| Seedance 2.x | $0.09~0.23/초 (해상도별) | 제3자 추정 ([CometAPI](https://www.cometapi.com/ai-video-api-pricing/), [Atlas Cloud](https://www.atlascloud.ai/blog/tips/cheapest-ai-video-generation-api-2026)) | 공식 확인 필요 |

### 3.2 이미지 생성 API (장당)
| 모델 | 가격 | 근거 |
| --- | --- | --- |
| Imagen 4 Fast / 4 / 4 Ultra | $0.02 / $0.04 / $0.06 | [Google Cloud 가격표 (공식)](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing?hl=en) |
| Gemini 3.1 Flash Image (Nano Banana 2) | 1K 약 $0.067, 2K $0.101 | [Gemini API Pricing (공식)](https://ai.google.dev/gemini-api/docs/pricing) |
| gpt-image-2 | low 약 $0.006, medium 약 $0.053, high 약 $0.211 (1024²) | [OpenAI Image generation guide (공식)](https://developers.openai.com/api/docs/guides/image-generation) — 공식 자료 간 토큰 단가 불일치, 검증 필요 |
| FLUX.2 [pro] | 약 $0.03 (호스트별 상이) | 제3자 ([NodeTool](https://nodetool.ai/blog/ai-image-generation-cost), [Movcl](https://movcl.com/blog/comparisons/ai-image-api-prices-compared/)) |
| Seedream 5.0 Lite / Pro | $0.035 / $0.045 | 제3자 (동일) |

### 3.3 TTS (한국어)
| 서비스 | 가격 | 무료 범위 | 타이밍(자막) | 근거·비고 |
| --- | --- | --- | --- | --- |
| Google Cloud TTS Chirp 3 HD | $30 / 100만 자 | **월 100만 자 무료** (30초 나레이션 약 4,000편) | ko-KR 지원·timepoint 지원 **검증 필요** | [Text-to-Speech pricing (공식)](https://cloud.google.com/text-to-speech/pricing) |
| ElevenLabs v4/v3/Multilingual v2 | $0.08 / 1천 자, Turbo·Flash $0.04 | 무료 1만 자(Turbo 2만), Voice Library 음성 API 사용 불가 | Forced Alignment(단어 타이밍) 제공 | [ElevenLabs API Pricing (공식)](https://elevenlabs.io/pricing/api). API 생성물은 상업 라이선스라고 명시하나 **무료 플랜의 상업 이용 여부는 불명확** |
| Azure Neural TTS | $15 / 100만 자 (제3자 기재) | – | word boundary 이벤트 | 제3자 ([Giggy](https://giggy.ai/text-to-speech/korean)) |
| OpenAI gpt-4o-mini-tts | 출력 $12 / 100만 토큰 (분당 약 $0.015 추정) | – | 없음 | [OpenAI 모델 페이지](https://developers.openai.com/api/docs/models/gpt-4o-mini-tts) — **deprecated 표기** |
| Typecast, Humelo 등 국내 | 공개 가격 미확인 | – | – | 자사 비교글만 존재 ([Typecast](https://typecast.ai/kr/learn/tts-natural-pronunciation-comparison-2026/), [Humelo](https://humelo.com/insights/korean-tts-api-comparison-2026)) |

한국어 품질: 독립 블라인드 평가에서 한국어는 상위권이 통계적 동률로 우열이 갈리지 않는다 ([Speko benchmark](https://benchmarks.speko.ai/best-tts-apis-2026/)). ElevenLabs 의 CJK 품질이 상대적으로 약하다는 평도 있음 ([DEV](https://dev.to/pocket_linguist/text-to-speech-in-2026-comparing-5-tts-apis-for-language-apps-606)). → **고정 대본 5개로 후보 3~4개 블라인드 청취 테스트** (DR-004, 무료 범위 안에서 가능).

### 3.4 대본 LLM (Claude, `claude-api` skill 기준)
| 모델 | 입력/출력 ($/100만 토큰) | 편당(입력 약 2천, 출력·사고 약 3천 토큰) |
| --- | --- | --- |
| Claude Opus 5.5 (기본) | $4 / $20 | 약 $0.07 |
| Claude Sonnet 5.5 | $2 / $10 | 약 $0.035 |
| Claude Haiku 5.5 | $0.10 / $0.50 | 약 $0.002 |

## 4. 연동·자동화 복잡도

| 항목 | 난이도 | 내용 |
| --- | --- | --- |
| 이미지 생성 | 낮음 | 대부분 동기 응답, 이미지 바이트 → Storage. 기존 `SceneVideoProvider` 가 이미지 출력도 허용 |
| 영상 생성 | 중간 | 비동기 작업 ID → 폴링(구현 완료: `external_job_id` 저장·재개), 공급사별 길이 제한(5/10초), 콘텐츠 정책 거부 처리 |
| TTS | 낮음 | 동기 응답. 단어 타이밍이 없으면 forced alignment 또는 기존 비례 정렬 사용 |
| 다중 공급사 | 중간 | 공급사별 키·가격·약관 관리 → **집계 API(Runway 의 Kling 재판매, fal 등)는 키 1개로 여러 모델**. 대신 마진·데이터 경유 고려 |

## 5. 재사용 가능한 공식 Skills · SDK · 오픈소스

| 대상 | 자료 | 활용 |
| --- | --- | --- |
| Remotion | 설치된 공식 플러그인 skills (`remotion-best-practices`, `remotion-captions`, `remotion-markup`(전환·효과), `remotion-elements`) | 이미지 모션(Ken Burns)·전환·자막 스타일을 직접 만들지 않고 skill 가이드·Elements 활용 |
| Claude | `claude-api` skill (Claude Code 기본), `@anthropic-ai/sdk` | 대본 provider. 구조화 출력으로 Script 스키마 강제 |
| Google | `@google/genai` SDK (Gemini API: Imagen·Veo·Gemini Image·TTS 한 SDK) | 이미지·영상·TTS 를 키 하나로 시험 가능 |
| ElevenLabs | 공식 SDK `@elevenlabs/elevenlabs-js`, 커뮤니티 skill(`elevenlabs-remotion`) | 공식 skill 은 확인되지 않음 — 커뮤니티 skill 은 참고만 |
| fal.ai | `@fal-ai/client`, 커뮤니티 skills(`fal-ai-community/skills`) | 여러 이미지·영상 모델을 키 하나로 비교 평가할 때 |
| Runway | 공식 SDK `@runwayml/sdk` | Gen-4 Turbo, Kling 재판매 |
| 오픈소스 | [gyoridavid/short-video-maker](https://unpkg.com/short-video-maker@1.3.0/README.md) (MIT, Remotion+TTS+Pexels), [OpenReels](https://dev.to/tsensei/i-open-sourced-an-ai-pipeline-that-turns-any-topic-into-a-youtube-short-e77) (MIT), [Automated-Video-Generator](https://cdn.jsdelivr.net/npm/automated-video-generator@1.0.0/README.md) (MIT, Edge-TTS) | 구조 참고. 우리는 이미 같은 파이프라인을 갖고 있어 **코드 도입 없이** Ken Burns·Pexels 검색 패턴만 참고 |
| 스톡 | [Pexels API](https://www.pexels.com/api/documentation/) — [상업적 무료](https://help.pexels.com/hc/en-us/articles/360042295214-Can-I-use-the-photos-and-videos-for-a-commercial-project), 200회/시간·2만회/월 | 무료 "실사 B-roll" provider 후보 |

## 6. 인프라 무료 플랜 조건 (공식 문서, 2026-11-25 확인)

| 서비스 | 무료 범위 | 일시 정지·제한 | 상업적 이용 | 근거 |
| --- | --- | --- | --- | --- |
| Supabase Free | DB 500MB, 파일 1GB, 전송 5GB(+캐시 5GB), MAU 5만, 프로젝트 2개 | **1주 비활성 시 일시 정지**(1년 내 복구 가능), 한도 지속 초과 시 서비스 제한 | 제한 문구 없음 | [Pricing](https://supabase.com/pricing), [Billing FAQ](https://supabase.com/docs/guides/platform/billing-faq), [Upgrading](https://supabase.com/docs/guides/platform/upgrading) |
| Trigger.dev Free | 월 $5 컴퓨트 크레딧, 동시 실행 20(prod), 스케줄 10개, 로그 1일 | 크레딧 소진 시 업그레이드 전까지 실행 중지, 카드 불필요 | 제한 문구 없음 | [Pricing](https://trigger.dev/pricing), [Limits](https://trigger.dev/docs/limits) |
| Vercel Hobby | 함수 최대 300초·2GB, 번들 250MB | 사전 통보 없이 중단될 수 있음 | **"개인적 또는 비상업적 용도로만"** → 수익화 운영 시 Pro 필요 | [Terms](https://vercel.com/legal/terms), [Hobby](https://vercel.com/docs/plans/hobby), [Functions limits](https://vercel.com/docs/functions/limitations) |

Trigger.dev 컴퓨트 단가: micro $0.0000169/초, small-1x $0.0000338/초, large-1x $0.00034/초, 실행당 $0.000025 ([Pricing](https://trigger.dev/pricing)).

## 7. 다음 단계 (승인 필요 항목 표시)

1. Provider 를 **서비스 설정에서 교체**하는 구조 구현 (이번 단계, 비용 없음) — DR-016
2. 이미지 모션(Ken Burns) 컴포지션 추가 (비용 없음)
3. 후보 평가: 고정 대본 5개 × 후보별 생성 — **예상 비용을 먼저 보고하고 승인 후 실행**
   - TTS 4종 × 5문장: 무료 범위 안 (Google 무료 100만 자, ElevenLabs 무료 1만 자) → $0
   - 이미지 3종 × 장면 10개: 약 $0.2~0.7
   - 영상 2종 × 5초 × 4장면: 약 $2~8

## 8. 선정 제안 (1차 후보 압축) — 평가 실행은 승인 후

DR-004 기준(필수: 상업적 이용·장면 단위 생성 / 가중: 한국어 품질 25, 비용 20, 시간 15, 비동기·복구 15, 한도 15, 연동 10)으로 문서 조사 단계 점수를 매겨 후보를 줄였다. 품질(25%)은 실측 전이라 동일하게 두고, 나머지 75점 만점.

| 종류 | 후보 | 비용(20) | 시간(15) | 비동기·복구(15) | 한도(15) | 연동(10) | 합계(75) | 판단 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 대본 | Claude (Opus 5.5 기본) | 18 | 13 | 13 | 13 | 10 | **67** | 확정 후보 (SDK·구조화 출력, skill 제공) |
| 이미지 | Imagen 4 Fast / 4 | 19 | 14 | 12 | 12 | 9 | **66** | 1순위 (Google 키 하나로 TTS 와 통합) |
| 이미지 | Gemini 3.1 Flash Image | 16 | 13 | 12 | 12 | 9 | 62 | 비교군 (텍스트 렌더링 강점) |
| 이미지 | gpt-image-2 low/med | 17 | 11 | 12 | 11 | 8 | 59 | 단가 공식 자료 불일치 → 보류 |
| 영상 | Runway Gen-4 Turbo | 15 | 10 | 14 | 12 | 9 | **60** | 1순위 (image-to-video → 혼합 방식에 적합, 공식 SDK) |
| 영상 | Kling 4.0 (Runway 경유) | 11 | 9 | 14 | 12 | 9 | 55 | 품질 비교군 (같은 SDK) |
| 영상 | Veo 3.1 | 8 | 9 | 13 | 11 | 8 | 49 | 가격 단위 확인 후 재평가 |
| TTS | Google Chirp 3 HD | 20 | 14 | 12 | 13 | 9 | **68** | 1순위 (월 1M자 무료). ko-KR 지원 확인 필요 |
| TTS | ElevenLabs v3 | 16 | 13 | 13 | 12 | 10 | **64** | 1순위 공동 (단어 타이밍 → 자막 정확) |

### 평가(실측) 계획과 예상 비용 — **승인 필요**
| 단계 | 내용 | 호출 수 | 예상 비용 |
| --- | --- | --- | --- |
| E1 TTS | 고정 대본 5개(각 약 240자) × Chirp 3 HD·ElevenLabs v3·(Gemini TTS) 블라인드 청취 | 15 | **$0** (각 무료 범위) |
| E2 대본 | Claude Opus 5.5 로 주제 5개 대본 + 스키마 검증 | 5 | 약 $0.35 |
| E3 이미지 | E2 대본 장면 30개 × Imagen 4 Fast·Gemini 3.1 Flash Image | 60 | 약 $2.6 |
| E4 영상 | 훅 장면 4개 × 5초 × Gen-4 Turbo·Kling(Runway) | 8 | 약 $4.1 |
| 합계 | | 88 | **약 $7 (상한 $10 으로 가드)** |

필요한 계정·키: Anthropic API, Google AI Studio(Gemini API: Imagen·Gemini Image·TTS) 또는 Google Cloud(Chirp 3 HD), ElevenLabs(무료 계정), Runway API. 각 키는 보안 입력 양식으로 받고, 평가 스크립트는 `estimateCostUsd` 합계가 상한을 넘으면 실행하지 않는다.
