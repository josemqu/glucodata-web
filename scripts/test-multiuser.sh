#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
container="glucodata-rls-test-$$"
trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT
docker run --rm -d --name "$container" -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine >/dev/null
for attempt in {1..30}; do
  if docker exec "$container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
sql() { docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 "$@"; }
sql < supabase/tests/fixtures/bootstrap.sql
for migration in supabase/migrations/*.sql; do sql < "$migration"; done
sql < supabase/tests/multiuser.sql
sql < supabase/tests/manual-glucose.sql
sql <<'SQL'
insert into auth.users(id) values('00000000-0000-4000-8000-000000000003');
insert into app_users(id,librelink_user_id) values('00000000-0000-4000-8000-000000000003','backfill-test');
insert into user_patients values('00000000-0000-4000-8000-000000000003','legacy-patient');
insert into glucose_measurements(patient_id,timestamp,value) values('legacy-patient','2026-01-01',120);
insert into events(patient_id,type,title,occurred_at) values('legacy-patient','note','Legacy note','2026-01-01');
SQL
sql -v app_user_id=00000000-0000-4000-8000-000000000003 -v patient_id=legacy-patient -v 'evidence=Explicit ownership confirmation in isolated test fixture' < scripts/backfill-user.sql
sql -v app_user_id=00000000-0000-4000-8000-000000000003 -v patient_id=legacy-patient -v 'evidence=Explicit ownership of global targets in isolated test' < scripts/backfill-targets.sql
sql -v app_user_id=00000000-0000-4000-8000-000000000003 -v patient_id=legacy-patient -v token_hash=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa < scripts/bind-integration.sql
sql -v app_user_id=00000000-0000-4000-8000-000000000003 -v patient_id=legacy-patient -v token_hash=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa < scripts/bind-integration.sql
sql <<'SQL'
do $$ begin
 if (select count(*) from glucose_measurements where user_id='00000000-0000-4000-8000-000000000003' and value=120)<>1 then raise exception 'Backfill missing'; end if;
 if (select counts->>'events' from legacy_ownership_assignments where counts ? 'events')<>'1' then raise exception 'Audit receipt missing'; end if;
end $$;
-- Force a conflict and prove the entire backfill remains unassigned.
insert into glucose_measurements(patient_id,timestamp,value) values('legacy-patient','2026-01-01',140);
SQL
if sql -v app_user_id=00000000-0000-4000-8000-000000000003 -v patient_id=legacy-patient -v 'evidence=Explicit ownership confirmation in isolated test fixture' < scripts/backfill-user.sql; then
  echo 'Expected uniqueness conflict was not raised' >&2; exit 1
fi
sql <<'SQL'
do $$ begin
 if (select count(*) from glucose_measurements where user_id is null and value=140)<>1 then raise exception 'Conflict did not roll back'; end if;
 if (select count(*) from legacy_ownership_assignments)<>2 then raise exception 'Failed backfill left receipt'; end if;
end $$;
SQL
echo 'PASS: migration, RLS, RPCs, backfill payload preservation and rollback'
