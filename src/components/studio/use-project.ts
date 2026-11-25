"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api-client";
import { isBusy } from "./status";
import type { ProjectDetail } from "./types";

/**
 * 프로젝트 상태 구독. 진행 상태는 DB 가 진실 공급원이므로 새로고침·브라우저 재시작 후에도 그대로 복원된다.
 * 생성·렌더 중에는 짧은 주기, 그 외에는 긴 주기로 폴링하고 탭이 다시 보일 때도 갱신한다.
 */
export function useProject(id: string, initial: ProjectDetail | null) {
  const [data, setData] = useState<ProjectDetail | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef(false);

  const refresh = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      setData(await api<ProjectDetail>(`/api/projects/${id}`));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했습니다.");
    } finally {
      inflight.current = false;
    }
  }, [id]);

  // 생성·렌더 중에는 1.5초, 검수 중에도 다른 탭·서버 작업 반영을 위해 10초마다 갱신
  const busy = data ? isBusy(data.project.status) : true;
  useEffect(() => {
    const t = setInterval(refresh, busy ? 1500 : 10_000);
    return () => clearInterval(t);
  }, [busy, refresh]);

  useEffect(() => {
    const onVisible = () => document.visibilityState === "visible" && void refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  useEffect(() => {
    if (!initial) void refresh();
  }, [initial, refresh]);

  return { data, error, refresh };
}
