#!/usr/bin/env bash
# 공식 Agent Skills 설치 (저장소에 벤더링하지 않는다 — 각 skill 의 라이선스·버전은 원본을 따른다).
# 사용: bash scripts/install-agent-skills.sh
# 참고: Trigger.dev skill 은 SDK 설치 후 `npx trigger.dev@latest install-mcp` 로도 설치 가능 (SDK 버전과 일치).
set -euo pipefail

add() { npx -y skills add "$1" --skill "$2"; }

# Remotion
add remotion-dev/skills remotion-best-practices
add remotion-dev/skills remotion-captions
add remotion-dev/skills remotion-render
add remotion-dev/skills remotion-saas
add remotion-dev/skills remotion-license

# Trigger.dev
add triggerdotdev/skills trigger-setup
add triggerdotdev/skills trigger-tasks
add triggerdotdev/skills trigger-realtime
add triggerdotdev/skills trigger-cost-savings

# Supabase
add supabase/agent-skills supabase
add supabase/agent-skills supabase-postgres-best-practices

# Vercel
add vercel-labs/agent-skills react-best-practices
add vercel-labs/agent-skills composition-patterns
add vercel-labs/agent-skills deploy-to-vercel

# Anthropic
add anthropics/skills claude-api
add anthropics/skills webapp-testing
add anthropics/skills skill-creator
