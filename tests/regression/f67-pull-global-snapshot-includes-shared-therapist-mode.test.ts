import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

async function main() {
  const migrationPath = path.resolve(
    process.cwd(),
    'supabase/migrations/20260315_update_pull_global_snapshot_shared_therapist_mode.sql'
  )

  assert.equal(
    fs.existsSync(migrationPath),
    true,
    'Expected a follow-up migration for pull_global_to_snapshot_v1 shared therapist mode support'
  )

  const sql = fs.readFileSync(migrationPath, 'utf8')

  assert.match(
    sql,
    /CREATE OR REPLACE FUNCTION public\.pull_global_to_snapshot_v1/s,
    'Expected the migration to replace pull_global_to_snapshot_v1'
  )

  assert.match(
    sql,
    /shared_therapist_mode/s,
    'Expected pull_global_to_snapshot_v1 migration to include shared_therapist_mode in snapshot staff rows'
  )
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
