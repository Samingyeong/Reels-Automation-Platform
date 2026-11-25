import { HomeClient } from "@/components/home/home-client";
import { listProjects } from "@/server/project-service";
import { requirePageUser } from "@/server/session";
import { createUserClientFromCookies } from "@/server/supabase";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { email } = await requirePageUser();
  const projects = await listProjects(await createUserClientFromCookies());
  return <HomeClient projects={projects} email={email} />;
}
