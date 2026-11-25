/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Remotion 렌더러(네이티브 컴포지터·Chromium)와 Trigger.dev SDK 는 번들하지 않고 Node 에서 직접 로드
  serverExternalPackages: ["@remotion/renderer", "@remotion/bundler", "@trigger.dev/sdk"],
  // 클라우드(Vercel)에서는 렌더를 Trigger.dev 에서만 한다 → 함수 번들에서 렌더러·컴포지터·사전 번들 제외
  outputFileTracingExcludes: {
    "*": [
      "node_modules/@remotion/renderer/**",
      "node_modules/@remotion/compositor-*/**",
      "node_modules/@remotion/bundler/**",
      ".remotion-bundle/**",
      "node_modules/supabase/**",
      "node_modules/trigger.dev/**",
      "node_modules/@depot/**",
    ],
  },
};

module.exports = nextConfig;
