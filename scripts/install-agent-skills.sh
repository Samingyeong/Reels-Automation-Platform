#!/usr/bin/env bash
# 공식 Agent Skills / 플러그인 설치 (프로젝트 범위).
#
#  - Remotion  : 공식 Claude Code 플러그인(remotion@remotion)만 사용한다.
#                remotion-dev/skills 와 스킬 구성이 동일(v4.0.547 기준 diff 확인)하므로 skills CLI 로 중복 설치하지 않는다.
#                플러그인 선언은 .claude/settings.json 에 커밋되어 있어 세션 시작 시 자동 적용된다.
#  - 나머지     : skills CLI (https://skills.sh) 로 .claude/skills/ 에 복사(--copy)하고 skills-lock.json 으로 버전을 고정한다.
#
# 사용: bash scripts/install-agent-skills.sh          (설치/갱신)
#       npx skills experimental_install              (lock 파일 기준 복원)
# 관련 문서: docs/decisions.md (DR-007)
set -euo pipefail
cd "$(dirname "$0")/.."

AGENT="claude-code"
add() { # add <repo> <skill...>
  local repo="$1"; shift
  local args=()
  for s in "$@"; do args+=(--skill "$s"); done
  npx -y skills@1.9.0 add "$repo" "${args[@]}" --agent "$AGENT" --copy --yes
}

# Trigger.dev (SDK 설치 후에는 node_modules/@trigger.dev/sdk 동봉본과 버전을 맞춘다)
add triggerdotdev/skills trigger-setup trigger-tasks trigger-realtime trigger-cost-savings
# Supabase
add supabase/agent-skills supabase supabase-postgres-best-practices
# Vercel
add vercel-labs/agent-skills vercel-react-best-practices vercel-composition-patterns deploy-to-vercel
# Anthropic
# claude-api, skill-creator 는 Claude Code 기본 제공 skill 과 중복되어 설치하지 않는다.
add anthropics/skills webapp-testing

# Remotion: 공식 플러그인 (project scope). 이미 선언돼 있으면 무시된다.
if command -v claude >/dev/null 2>&1; then
  claude plugin marketplace add remotion-dev/claude-code-plugin --scope project || true
  claude plugin install remotion@remotion --scope project || true
else
  echo "claude CLI 가 없어 Remotion 플러그인 설치를 건너뜁니다 (.claude/settings.json 선언으로 자동 적용)."
fi
