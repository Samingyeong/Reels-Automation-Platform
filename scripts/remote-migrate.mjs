#!/usr/bin/env node
/**
 * 클라우드 Supabase 프로젝트에 마이그레이션 적용 (Supabase Management API `database/query`).
 *  - DB 비밀번호 없이 개인 액세스 토큰(PAT)으로 동작한다. 토큰은 SUPABASE_ACCESS_TOKEN 으로 받는다
 *    (이 클라우드 개발 환경에서는 프록시가 주입하므로 placeholder 값을 넣는다).
 *  - 적용 이력은 Supabase CLI 와 같은 supabase_migrations.schema_migrations 에 기록 → CLI(`db push --remote`)와 호환.
 *  - 이미 적용된 버전은 건너뛰고, 각 파일은 이력 기록과 함께 한 트랜잭션으로 실행한다.
 *
 * 사용: SUPABASE_ACCESS_TOKEN=… node scripts/remote-migrate.mjs <project-ref> [--dry-run]
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const [ref, flag] = process.argv.slice(2);
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!ref || !token) {
  console.error("사용: SUPABASE_ACCESS_TOKEN=… node scripts/remote-migrate.mjs <project-ref> [--dry-run]");
  process.exit(1);
}
const dryRun = flag === "--dry-run";

async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

const dollar = (s) => {
  let tag = "mig";
  while (s.includes(`$${tag}$`)) tag += "x";
  return `$${tag}$${s}$${tag}$`;
};

await query(`create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text);`);
const applied = new Set((await query("select version from supabase_migrations.schema_migrations")).map((r) => r.version));

const dir = path.join(process.cwd(), "supabase", "migrations");
const files = (await readdir(dir)).filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort();
for (const file of files) {
  const [version, ...rest] = file.replace(/\.sql$/, "").split("_");
  const name = rest.join("_");
  if (applied.has(version)) {
    console.log(`= ${file} (이미 적용됨)`);
    continue;
  }
  if (dryRun) {
    console.log(`~ ${file} (적용 예정)`);
    continue;
  }
  const sql = await readFile(path.join(dir, file), "utf8");
  await query(`begin;
${sql}
insert into supabase_migrations.schema_migrations (version, name, statements) values ('${version}', '${name}', array[${dollar(sql)}]);
commit;`);
  console.log(`+ ${file} 적용`);
}
