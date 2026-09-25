-- ==========================================================
-- Oriflame Sub-Dealer Stock Manager — Supabase schema
-- Run this once in Supabase: Project → SQL Editor → New query → paste → Run
-- ==========================================================

create extension if not exists pgcrypto;

-- ---------- PRODUCTS ----------
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_url text,
  quantity integer not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- PURCHASES (bill header) ----------
create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  dealer_name text not null,
  purchase_date date not null,
  payment_type text not null check (payment_type in ('cash','credit')),
  total_amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- PURCHASE ITEMS (bill lines) ----------
create table if not exists purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name text not null,
  quantity integer not null,
  unit_price numeric(12,2) not null,
  amount numeric(12,2) not null,
  created_at timestamptz not null default now()
);

-- ---------- SALES (bill header) ----------
create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  buyer_name text not null,
  sale_date date not null,
  payment_type text not null check (payment_type in ('cash','credit')),
  total_amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

-- ---------- SALE ITEMS (bill lines) ----------
create table if not exists sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references sales(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  product_name text not null,
  style text,
  quantity integer not null,
  unit_price numeric(12,2) not null,
  amount numeric(12,2) not null,
  created_at timestamptz not null default now()
);

-- ---------- Helpful indexes ----------
create index if not exists idx_purchase_items_purchase on purchase_items(purchase_id);
create index if not exists idx_sale_items_sale on sale_items(sale_id);
create index if not exists idx_purchases_date on purchases(purchase_date);
create index if not exists idx_sales_date on sales(sale_date);

-- ==========================================================
-- Row Level Security
-- This is a single-user internal tool accessed with the public
-- "anon" key, so we open full read/write access to these five
-- tables only. Do NOT reuse this anon key for anything public-facing.
-- ==========================================================
alter table products enable row level security;
alter table purchases enable row level security;
alter table purchase_items enable row level security;
alter table sales enable row level security;
alter table sale_items enable row level security;

drop policy if exists "public access products" on products;
create policy "public access products" on products for all using (true) with check (true);

drop policy if exists "public access purchases" on purchases;
create policy "public access purchases" on purchases for all using (true) with check (true);

drop policy if exists "public access purchase_items" on purchase_items;
create policy "public access purchase_items" on purchase_items for all using (true) with check (true);

drop policy if exists "public access sales" on sales;
create policy "public access sales" on sales for all using (true) with check (true);

drop policy if exists "public access sale_items" on sale_items;
create policy "public access sale_items" on sale_items for all using (true) with check (true);

-- ==========================================================
-- Storage bucket for product photos
-- After running this file, also go to:
-- Supabase → Storage → Create bucket → name it exactly: product-images
-- → toggle "Public bucket" ON.
-- Then run the two statements below so the app can upload/read photos.
-- ==========================================================
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "public read product images" on storage.objects;
create policy "public read product images" on storage.objects
  for select using (bucket_id = 'product-images');

drop policy if exists "public upload product images" on storage.objects;
create policy "public upload product images" on storage.objects
  for insert with check (bucket_id = 'product-images');

drop policy if exists "public update product images" on storage.objects;
create policy "public update product images" on storage.objects
  for update using (bucket_id = 'product-images');

drop policy if exists "public delete product images" on storage.objects;
create policy "public delete product images" on storage.objects
  for delete using (bucket_id = 'product-images');
