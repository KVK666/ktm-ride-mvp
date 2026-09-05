-- Version 0 baselining lets existing installations run these non-destructive
-- creates before the former additive schema updates in V2.
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  name text not null default 'Rider',
  bike_model text not null default 'Motorcycle',
  created_at timestamptz not null default now()
);

create table if not exists rides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  start_label text,
  end_label text,
  start_latitude numeric(10,7),
  start_longitude numeric(10,7),
  end_latitude numeric(10,7),
  end_longitude numeric(10,7),
  distance_m integer not null default 0,
  duration_s integer not null default 0,
  top_speed_kmh numeric,
  avg_speed_kmh numeric,
  client_ride_id text,
  title text,
  notes text,
  reviewed_at timestamptz,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists ride_points (
  id bigserial primary key,
  ride_id uuid not null references rides(id) on delete cascade,
  latitude numeric(10,7) not null,
  longitude numeric(10,7) not null,
  altitude_m numeric,
  accuracy_m numeric,
  speed_kmh numeric,
  recorded_at timestamptz not null
);

create index if not exists ride_points_ride_recorded_idx on ride_points(ride_id, recorded_at);
