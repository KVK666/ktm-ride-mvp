-- Preserve the former additive startup updates in their original order.

alter table users add column if not exists profile_photo_data bytea;

alter table users add column if not exists profile_photo_mime text;

alter table users add column if not exists profile_photo_updated_at timestamptz;

alter table users add column if not exists monthly_distance_goal_km integer check (monthly_distance_goal_km between 10 and 5000);

create unique index if not exists users_id_unique_idx on users(id);

create table if not exists password_reset_tokens (id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade, token_hash text not null unique, expires_at timestamptz not null, used_at timestamptz, created_at timestamptz not null default now());

alter table password_reset_tokens alter column id set default gen_random_uuid(), alter column created_at set default now();

do $$ begin if not exists (select 1 from pg_constraint where conrelid = 'password_reset_tokens'::regclass and contype = 'f' and conkey = array[(select attnum from pg_attribute where attrelid = 'password_reset_tokens'::regclass and attname = 'user_id')]::smallint[] and confrelid = 'users'::regclass) then alter table password_reset_tokens drop constraint if exists password_reset_tokens_user_id_fkey; alter table password_reset_tokens add constraint password_reset_tokens_user_id_fkey foreign key (user_id) references users(id) on delete cascade not valid; end if; end $$;

create table if not exists ride_album_photos (id uuid primary key default gen_random_uuid(), ride_id uuid not null references rides(id) on delete cascade, user_id uuid not null references users(id) on delete cascade, image_data bytea not null, mime_type text not null, file_name text, created_at timestamptz not null default now(), imported_at timestamptz not null default now(), latitude numeric(10, 7), longitude numeric(10, 7), has_location boolean not null default false);

alter table ride_album_photos alter column id set default gen_random_uuid(), alter column created_at set default now(), alter column imported_at set default now(), alter column has_location set default false;

create table if not exists trips (id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade, title text not null, description text, cover_ride_id uuid references rides(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now());

alter table trips alter column id set default gen_random_uuid(), alter column created_at set default now(), alter column updated_at set default now();

create table if not exists trip_rides (trip_id uuid not null references trips(id) on delete cascade, ride_id uuid not null references rides(id) on delete cascade, sort_order integer not null default 0, added_at timestamptz not null default now(), primary key (trip_id, ride_id));

alter table trip_rides alter column sort_order set default 0, alter column added_at set default now();

create table if not exists saved_places (id uuid primary key default gen_random_uuid(), user_id uuid not null references users(id) on delete cascade, label text not null, kind text not null default 'other', latitude numeric(10, 7) not null, longitude numeric(10, 7) not null, radius_m integer not null default 180, created_at timestamptz not null default now(), updated_at timestamptz not null default now());

alter table saved_places alter column id set default gen_random_uuid(), alter column created_at set default now(), alter column updated_at set default now();

do $$ begin if not exists (select 1 from pg_constraint where conrelid = 'saved_places'::regclass and contype = 'f' and conkey = array[(select attnum from pg_attribute where attrelid = 'saved_places'::regclass and attname = 'user_id')]::smallint[] and confrelid = 'users'::regclass) then alter table saved_places drop constraint if exists saved_places_user_id_fkey; alter table saved_places add constraint saved_places_user_id_fkey foreign key (user_id) references users(id) on delete cascade not valid; end if; end $$;

alter table rides add column if not exists ai_title text;

alter table rides add column if not exists ai_summary text;

alter table rides add column if not exists ride_kind text;

alter table rides add column if not exists ride_kind_confidence numeric(4, 3);

alter table rides add column if not exists ride_kind_reason text;

alter table rides add column if not exists key_insight text;

alter table rides add column if not exists best_moment text;

alter table rides add column if not exists trip_suggestion jsonb;

alter table rides add column if not exists ai_status text not null default 'fallback';

alter table rides add column if not exists ai_generated_at timestamptz;

alter table rides add column if not exists destination_name text;

alter table rides add column if not exists destination_category text;

alter table rides add column if not exists destination_address text;

alter table rides add column if not exists destination_source text;

alter table rides add column if not exists ai_context_version integer not null default 0;

create index if not exists password_reset_tokens_user_idx on password_reset_tokens(user_id, created_at desc);

create index if not exists password_reset_tokens_expires_idx on password_reset_tokens(expires_at);

create index if not exists ride_album_photos_ride_imported_idx on ride_album_photos(ride_id, imported_at desc);

create index if not exists ride_album_photos_user_idx on ride_album_photos(user_id, imported_at desc);

alter table ride_album_photos add column if not exists client_photo_id text;

create unique index if not exists ride_album_photos_client_id_idx on ride_album_photos(user_id, ride_id, client_photo_id) where client_photo_id is not null;

create index if not exists trips_user_updated_idx on trips(user_id, updated_at desc);

create unique index if not exists trip_rides_trip_ride_idx on trip_rides(trip_id, ride_id);

create index if not exists trip_rides_ride_idx on trip_rides(ride_id, added_at desc);

create unique index if not exists saved_places_user_label_idx on saved_places(user_id, lower(label));

create index if not exists rides_user_started_id_idx on rides(user_id, started_at desc, id desc);

alter table rides add column if not exists source text not null default 'ridepulse';

alter table rides add column if not exists source_activity_type text;

alter table rides add column if not exists speed_data_quality text;

update rides set source = 'ridepulse' where source is null;

alter table rides alter column source set not null;

create unique index if not exists rides_user_client_id_idx on rides(user_id, client_ride_id) where client_ride_id is not null;

alter table trips add column if not exists client_trip_id text;

create unique index if not exists trips_user_client_trip_id_idx on trips(user_id, client_trip_id) where client_trip_id is not null;
