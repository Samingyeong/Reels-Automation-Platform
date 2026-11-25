/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Remotion 렌더러(네이티브 컴포지터·Chromium)와 Trigger.dev SDK 는 번들하지 않고 Node 에서 직접 로드
  serverExternalPackages: ["@remotion/renderer", "@remotion/bundler", "@trigger.dev/sdk"],
};

module.exports = nextConfig;
