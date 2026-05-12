insert into users (id, email, password_hash, name, bike_model)
values (
  '11111111-1111-1111-1111-111111111111',
  'rider@example.com',
  '$2a$10$pT.63lftPN9UNETXPQmMveMsjjz2kq1cihN27sws/jk4Skf6U23r6',
  'Duke Rider',
  'KTM Duke 250 Gen 3'
)
on conflict (email) do nothing;

insert into rides (
  id, user_id, start_label, end_label,
  start_latitude, start_longitude, end_latitude, end_longitude,
  distance_m, duration_s, top_speed_kmh, avg_speed_kmh,
  started_at, ended_at
)
values
(
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Home',
  'Weekend coffee stop',
  12.9716000,
  77.5946000,
  12.9352000,
  77.6245000,
  8700,
  960,
  84.4,
  32.6,
  now() - interval '2 days',
  now() - interval '2 days' + interval '16 minutes'
),
(
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  'Office',
  'Home',
  12.9352000,
  77.6245000,
  12.9716000,
  77.5946000,
  9100,
  1180,
  76.8,
  27.8,
  now() - interval '1 day',
  now() - interval '1 day' + interval '19 minutes 40 seconds'
)
on conflict (id) do nothing;

insert into ride_points (ride_id, latitude, longitude, altitude_m, speed_kmh, recorded_at)
values
('22222222-2222-2222-2222-222222222222', 12.9716000, 77.5946000, 890, 0, now() - interval '2 days'),
('22222222-2222-2222-2222-222222222222', 12.9620000, 77.6040000, 891, 42, now() - interval '2 days' + interval '4 minutes'),
('22222222-2222-2222-2222-222222222222', 12.9510000, 77.6130000, 893, 66, now() - interval '2 days' + interval '8 minutes'),
('22222222-2222-2222-2222-222222222222', 12.9352000, 77.6245000, 895, 12, now() - interval '2 days' + interval '16 minutes'),
('33333333-3333-3333-3333-333333333333', 12.9352000, 77.6245000, 895, 0, now() - interval '1 day'),
('33333333-3333-3333-3333-333333333333', 12.9480000, 77.6160000, 893, 48, now() - interval '1 day' + interval '5 minutes'),
('33333333-3333-3333-3333-333333333333', 12.9605000, 77.6042000, 891, 61, now() - interval '1 day' + interval '11 minutes'),
('33333333-3333-3333-3333-333333333333', 12.9716000, 77.5946000, 890, 9, now() - interval '1 day' + interval '19 minutes 40 seconds');
