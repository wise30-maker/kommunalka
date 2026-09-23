-- Схема БД kommunalka + RLS. Выполнить целиком в Supabase Dashboard → SQL → New query.

create table if not exists public.objects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  sort_order  int  not null default 0,
  split_water boolean not null default false  -- разделять воду на кухня/ванная
);

create table if not exists public.payment_items (
  id         uuid primary key default gen_random_uuid(),
  object_id  uuid not null references public.objects(id) on delete cascade,
  key        text not null,                -- kvartplata|electro|voda|tko|domofon|kapremont|otoplenie|gaz|tv
  title      text not null,
  sort_order int  not null default 0,
  unique (object_id, key)
);

create table if not exists public.periods (
  id         uuid primary key default gen_random_uuid(),
  object_id  uuid not null references public.objects(id) on delete cascade,
  year       int  not null,
  label      text not null,                -- "Октябрь", "Август + Сентябрь", "Март\Апрель"
  sort_key   numeric not null,             -- YYYY.MM для сортировки (склеенные: дробный/условный)
  unique (object_id, year, label)
);

create table if not exists public.payments (
  id        uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.periods(id) on delete cascade,
  item_id   uuid not null references public.payment_items(id) on delete cascade,
  amount    numeric(12,2) not null default 0,
  unique (period_id, item_id)
);

create table if not exists public.meter_readings (
  id        uuid primary key default gen_random_uuid(),
  period_id uuid not null references public.periods(id) on delete cascade,
  kind      text not null,                 -- water_cold|water_hot|elec_day|elec_night
  zone      text,                          -- null = единая зона; 'kitchen'|'bath'
  value     numeric(14,3) not null,
  unique (period_id, kind, zone)
);

create index if not exists idx_periods_object_sort  on public.periods(object_id, sort_key);
create index if not exists idx_payments_period      on public.payments(period_id);
create index if not exists idx_readings_period      on public.meter_readings(period_id);

-- RLS: только авторизованный владелец (регистрация в проекте отключена, пользователь один)
alter table public.objects        enable row level security;
alter table public.payment_items  enable row level security;
alter table public.periods        enable row level security;
alter table public.payments       enable row level security;
alter table public.meter_readings enable row level security;

create policy "owner_all_objects"        on public.objects        for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "owner_all_payment_items"  on public.payment_items  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "owner_all_periods"        on public.periods        for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "owner_all_payments"       on public.payments       for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "owner_all_meter_readings" on public.meter_readings for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Права на чтение/запись для API-ролей (Supabase обычно даёт default privileges, но на всякий случай явно)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
