create extension if not exists "uuid-ossp";

create table if not exists users (
  id uuid primary key default uuid_generate_v4(),
  email text not null unique,
  password_hash text not null,
  name text not null default 'Rider',
  bike_model text not null default 'KTM Duke 250 Gen 3',
  created_at timestamptz not null default now()
);

create table if not exists rides (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references users(id) on delete cascade,
  start_label text not null,
  end_label text not null,
  start_latitude numeric(10, 7) not null,
  start_longitude numeric(10, 7) not null,
  end_latitude numeric(10, 7) not null,
  end_longitude numeric(10, 7) not null,
  distance_m integer not null default 0,
  duration_s integer not null default 0,
  top_speed_kmh numeric(6, 2) not null default 0,
  avg_speed_kmh numeric(6, 2) not null default 0,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists ride_points (
  id bigserial primary key,
  ride_id uuid not null references rides(id) on delete cascade,
  latitude numeric(10, 7) not null,
  longitude numeric(10, 7) not null,
  altitude_m numeric(8, 2),
  speed_kmh numeric(6, 2),
  recorded_at timestamptz not null
);

create index if not exists rides_user_started_idx on rides(user_id, started_at desc);
create index if not exists ride_points_ride_time_idx on ride_points(ride_id, recorded_at asc);
