import { notFound } from "next/navigation";
import { Studio } from "@/components/studio/studio";
import { ServiceError } from "@/server/errors";
import { getProjectDetail } from "@/server/project-service";
import { getProviders } from "@/providers/registry";
import { requirePageUser } from "@/server/session";
import { createUserClientFromCookies } from "@/server/supabase";

export const dynamic = "force-dynamic";

export default async function StudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ scene?: string }>;
}) {
  await requirePageUser();
  const [{ id }, { scene }] = await Promise.all([params, searchParams]);
  const detail = await getProjectDetail(await createUserClientFromCookies(), id).catch((e) => {
    if (e instanceof ServiceError && e.code === "NOT_FOUND") notFound();
    throw e;
  });
  const mock = getProviders().sceneVideo.info.mode === "mock";
  return <Studio initial={detail} initialSceneId={scene ?? null} mock={mock} />;
}
