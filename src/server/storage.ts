import "server-only";
import type { Db } from "./supabase";

/** 비공개 버킷. 경로 규칙: {user_id}/{project_id}/{kind}/{id}.{ext} (Storage RLS 가 첫 폴더로 소유자 확인) */
export const MEDIA_BUCKET = "media";

export function mediaPath(userId: string, projectId: string, kind: string, id: string, ext: string) {
  return `${userId}/${projectId}/${kind}/${id}.${ext}`;
}

export async function uploadMedia(admin: Db, path: string, data: Uint8Array, contentType: string) {
  const { error } = await admin.storage.from(MEDIA_BUCKET).upload(path, data, { contentType, upsert: true });
  if (error) throw new Error(`Storage 업로드 실패 (${path}): ${error.message}`);
  return { storagePath: path, sizeBytes: data.byteLength, mimeType: contentType };
}

/**
 * 서명 URL 일괄 발급. 사용자 다운로드용이 아니라 Player 미리보기·렌더러·(M4) Instagram 이
 * 비공개 버킷의 파일을 읽기 위한 짧은 수명의 URL 이다.
 */
export async function signMedia(admin: Db, paths: string[], expiresInSec = 3600): Promise<Map<string, string>> {
  const unique = [...new Set(paths)];
  const map = new Map<string, string>();
  if (unique.length === 0) return map;
  const { data, error } = await admin.storage.from(MEDIA_BUCKET).createSignedUrls(unique, expiresInSec);
  if (error) throw new Error(`서명 URL 발급 실패: ${error.message}`);
  for (const item of data ?? []) if (item.path && item.signedUrl) map.set(item.path, item.signedUrl);
  return map;
}
