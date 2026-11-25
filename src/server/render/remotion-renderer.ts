import "server-only";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { REEL_COMPOSITION_ID, type ReelCompositionProps } from "../../domain/schemas";

/**
 * 렌더러: 승인된 컴포지션 props → MP4 바이트. (공식 remotion-render / remotion-saas skill 의 Node SSR 방식)
 *  - 번들은 빌드 시 `npm run remotion:bundle` 로 미리 만든 `.remotion-bundle` 을 사용한다 (요청마다 webpack 실행 안 함)
 *  - 출력: H.264 yuv420p + AAC (Instagram Reels 규격, docs/decisions.md DR-003). Remotion 이 faststart 로 마무리한다.
 *  - 라이선스: 무료 라이선스이므로 licenseKey 는 없으면 null (DR-001)
 */
export type RenderResult = { data: Uint8Array; durationMs: number; mimeType: "video/mp4" };
export type Renderer = (props: ReelCompositionProps, onProgress?: (p: number) => void) => Promise<RenderResult>;

export function resolveServeUrl(): string {
  const serveUrl = process.env.REMOTION_SERVE_URL ?? path.join(process.cwd(), ".remotion-bundle");
  if (!/^https?:/.test(serveUrl) && !existsSync(path.join(serveUrl, "index.html"))) {
    throw new Error(`Remotion 번들이 없습니다: ${serveUrl} (npm run remotion:bundle)`);
  }
  return serveUrl;
}

export function createRemotionRenderer(): Renderer {
  return async (props, onProgress) => {
    // 컴포지터 바이너리를 포함하므로 Next 번들에서 제외하고 실행 시점에 불러온다 (next.config serverExternalPackages)
    const { renderMedia, selectComposition, ensureBrowser } = await import("@remotion/renderer");
    const serveUrl = resolveServeUrl();
    const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;
    if (!browserExecutable) await ensureBrowser();

    const composition = await selectComposition({ serveUrl, id: REEL_COMPOSITION_ID, inputProps: props, browserExecutable });
    const outputLocation = path.join(os.tmpdir(), `reel-${randomUUID()}.mp4`);
    try {
      await renderMedia({
        composition,
        serveUrl,
        inputProps: props,
        codec: "h264",
        audioCodec: "aac",
        audioBitrate: "128k",
        pixelFormat: "yuv420p",
        enforceAudioTrack: true,
        outputLocation,
        browserExecutable,
        licenseKey: process.env.REMOTION_LICENSE_KEY || null,
        onProgress: ({ progress }) => onProgress?.(progress),
      });
      const data = new Uint8Array(await readFile(outputLocation));
      return { data, durationMs: Math.round((composition.durationInFrames / composition.fps) * 1000), mimeType: "video/mp4" };
    } finally {
      await rm(outputLocation, { force: true });
    }
  };
}
