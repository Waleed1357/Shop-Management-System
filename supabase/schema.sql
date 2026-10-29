-- =====================================================================
-- Awan Electronics Service Center - database schema
-- Run this whole file once in Supabase -> SQL Editor -> New query.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Complaints (one row per client complaint / job)
-- ---------------------------------------------------------------------
create table if not exists public.complaints (
  id             uuid primary key default gen_random_uuid(),
  complaint_no   text not null unique,
  client_name    text not null,
  led_model      text not null,
  serial_number  text not null,
  phone          text not null,
  address        text not null,
  technician     text,
  defect         text,
  accessories    text,
  notes          text,
  status         text not null default 'pending'
                 check (status in ('pending', 'in_progress', 'resolved')),
  complaint_date date not null default current_date,
  created_at     timestamptz not null default now()
);

-- SMS sent to the client when the complaint is registered
alter table public.complaints add column if not exists sms_status text
  check (sms_status in ('sent', 'failed', 'not_configured'));
alter table public.complaints add column if not exists sms_error text;
alter table public.complaints add column if not exists sms_sent_at timestamptz;

create index if not exists complaints_phone_idx on public.complaints (phone);
create index if not exists complaints_date_idx  on public.complaints (complaint_date);

-- ---------------------------------------------------------------------
-- Shop purchases made by walk-in customers
-- ---------------------------------------------------------------------
create table if not exists public.shop_purchases (
  id            uuid primary key default gen_random_uuid(),
  customer_name text not null,
  phone         text not null,
  address       text not null,
  product       text not null,
  amount        numeric(12, 2) not null check (amount >= 0),
  purchase_date date not null default current_date,
  created_at    timestamptz not null default now()
);

create index if not exists shop_purchases_phone_idx on public.shop_purchases (phone);
create index if not exists shop_purchases_date_idx on public.shop_purchases (purchase_date);

-- Warranty given with a shop purchase, e.g. 6 months (both empty = no warranty)
alter table public.shop_purchases add column if not exists warranty_value integer;
alter table public.shop_purchases add column if not exists warranty_unit text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'shop_purchase_warranty') then
    alter table public.shop_purchases add constraint shop_purchase_warranty check (
      (warranty_value is null and warranty_unit is null)
      or (warranty_value > 0 and warranty_unit in ('days', 'months', 'years'))
    );
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Invoices (amount charged for a complaint or shop purchase)
-- ---------------------------------------------------------------------
create table if not exists public.invoices (
  id           uuid primary key default gen_random_uuid(),
  invoice_no   text not null unique,
  complaint_id uuid references public.complaints (id) on delete cascade,
  purchase_id  uuid references public.shop_purchases (id) on delete cascade,
  description  text not null default 'LED Repair Service',
  amount       numeric(12, 2) not null check (amount >= 0),
  paid_amount  numeric(12, 2) not null default 0 check (paid_amount >= 0),
  status       text not null default 'paid' check (status in ('paid', 'partial', 'pending')),
  invoice_date date not null default current_date,
  created_at   timestamptz not null default now()
);

alter table public.invoices alter column complaint_id drop not null;
alter table public.invoices add column if not exists purchase_id uuid references public.shop_purchases (id) on delete cascade;
alter table public.invoices add column if not exists paid_amount numeric(12, 2) not null default 0;
alter table public.invoices drop constraint if exists invoices_paid_amount_check;
alter table public.invoices drop constraint if exists invoice_paid_amount;
alter table public.invoices add constraint invoices_paid_amount_check check (paid_amount >= 0 and paid_amount <= amount);
alter table public.invoices drop constraint if exists invoices_status_check;
alter table public.invoices drop constraint if exists invoice_status;
alter table public.invoices add constraint invoices_status_check check (status in ('paid', 'partial', 'pending'));
create index if not exists invoices_complaint_idx on public.invoices (complaint_id);
create index if not exists invoices_purchase_idx on public.invoices (purchase_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoice_one_source') then
    alter table public.invoices add constraint invoice_one_source
      check (num_nonnulls(complaint_id, purchase_id) = 1);
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Inventory (spare parts / products in stock)
-- ---------------------------------------------------------------------
create table if not exists public.inventory_items (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text,
  sku         text,
  quantity    integer not null default 0 check (quantity >= 0),
  cost_price  numeric(12, 2) not null default 0,
  sale_price  numeric(12, 2) not null default 0,
  min_stock   integer not null default 0,
  created_at  timestamptz not null default now()
);

create or replace function public.add_inventory_stock(p_item_id uuid, p_quantity integer)
returns public.inventory_items
language plpgsql
security invoker
set search_path = public
as $$
declare
  updated_item public.inventory_items;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'Incoming quantity must be at least one.';
  end if;

  update public.inventory_items
  set quantity = quantity + p_quantity
  where id = p_item_id
  returning * into updated_item;

  if not found then
    raise exception 'Inventory item could not be found.';
  end if;

  return updated_item;
end;
$$;

-- ---------------------------------------------------------------------
-- Technicians + things they take on credit (pay after the work)
-- ---------------------------------------------------------------------
create table if not exists public.technicians (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text,
  created_at timestamptz not null default now()
);

-- Products a technician takes. He can return some of them later;
-- he is billed only for what he used: (quantity - returned_quantity) * unit_price.
create table if not exists public.technician_purchases (
  id                uuid primary key default gen_random_uuid(),
  technician_id     uuid not null references public.technicians (id) on delete cascade,
  item_id           uuid references public.inventory_items (id) on delete set null,
  item_name         text not null,
  quantity          integer not null default 1 check (quantity > 0),
  returned_quantity integer not null default 0,
  unit_price        numeric(12, 2) not null default 0 check (unit_price >= 0),
  payment_status   text not null default 'pending',
  total_amount      numeric(12, 2) generated always as ((quantity - returned_quantity) * unit_price) stored,
  purchase_date     date not null default current_date,
  returned_date     date,
  notes             text,
  created_at        timestamptz not null default now(),
  constraint returned_within_quantity check (returned_quantity >= 0 and returned_quantity <= quantity)
);

-- Upgrade a table created by the first version of this schema
-- (it had paid_amount per item and no returns). Safe to run any number of times.
alter table public.technician_purchases add column if not exists returned_quantity integer not null default 0;
alter table public.technician_purchases add column if not exists unit_price numeric(12, 2) not null default 0;
alter table public.technician_purchases add column if not exists payment_status text not null default 'pending';
alter table public.technician_purchases add column if not exists returned_date date;
alter table public.technician_purchases drop constraint if exists paid_not_more_than_total;
alter table public.technician_purchases drop column if exists paid_amount;

do $$
begin
  -- Old total_amount was a plain column: copy its value into unit_price, then make it calculated.
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'technician_purchases'
               and column_name = 'total_amount' and is_generated = 'NEVER') then
    update public.technician_purchases set unit_price = round(total_amount / quantity, 2) where unit_price = 0;
    alter table public.technician_purchases drop column total_amount;
    alter table public.technician_purchases add column total_amount numeric(12, 2)
      generated always as ((quantity - returned_quantity) * unit_price) stored;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'returned_within_quantity') then
    alter table public.technician_purchases add constraint returned_within_quantity
      check (returned_quantity >= 0 and returned_quantity <= quantity);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'technician_purchase_payment_status') then
    alter table public.technician_purchases add constraint technician_purchase_payment_status
      check (payment_status in ('paid', 'pending'));
  end if;
end $$;

-- Money the technician pays back to the owner.
create table if not exists public.technician_payments (
  id            uuid primary key default gen_random_uuid(),
  technician_id uuid not null references public.technicians (id) on delete cascade,
  amount        numeric(12, 2) not null check (amount > 0),
  payment_date  date not null default current_date,
  notes         text,
  created_at    timestamptz not null default now()
);

-- Keep inventory stock in sync:
--   taking an item       -> stock goes down
--   returning some       -> stock goes back up
--   deleting the record  -> whatever wasn't returned goes back to stock
create or replace function public.adjust_stock_for_purchase()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and new.item_id is not null then
    update public.inventory_items set quantity = quantity - new.quantity where id = new.item_id;
  elsif tg_op = 'UPDATE' and new.item_id is not null and new.returned_quantity <> old.returned_quantity then
    update public.inventory_items
      set quantity = quantity + (new.returned_quantity - old.returned_quantity)
      where id = new.item_id;
  elsif tg_op = 'DELETE' and old.item_id is not null then
    update public.inventory_items
      set quantity = quantity + (old.quantity - old.returned_quantity)
      where id = old.item_id;
  end if;
  return null;
end $$;

drop trigger if exists technician_purchase_stock on public.technician_purchases;
create trigger technician_purchase_stock
after insert or update or delete on public.technician_purchases
for each row execute function public.adjust_stock_for_purchase();

-- Legacy complaint intake RPC is no longer used for recording technician items.
drop function if exists public.save_complaint_with_items(jsonb, jsonb, uuid);

-- save_technician_with_items (adds a technician and their items in one go) is defined
-- further down, after the part-payment columns.

-- ---------------------------------------------------------------------
-- Part payments for technician items
--   payment_status: 'paid' (all paid), 'partial' (paid_amount paid so far), 'pending' (nothing paid)
-- ---------------------------------------------------------------------
alter table public.technician_purchases add column if not exists paid_amount numeric(12, 2) not null default 0;
alter table public.technician_purchases drop constraint if exists technician_purchase_payment_status;
alter table public.technician_purchases add constraint technician_purchase_payment_status
  check (payment_status in ('paid', 'partial', 'pending'));
alter table public.technician_purchases drop constraint if exists technician_purchase_paid_amount;
alter table public.technician_purchases add constraint technician_purchase_paid_amount
  check (paid_amount >= 0);

-- Add a technician and their items (inventory or custom, with any part payment) as one transaction.
create or replace function public.save_technician_with_items(
  p_technician jsonb,
  p_items jsonb default '[]'::jsonb
)
returns public.technicians
language plpgsql
security invoker
set search_path = public
as $$
declare
  saved_technician public.technicians;
  technician_id uuid;
  selected_item jsonb;
  inventory_item public.inventory_items;
  item_quantity integer;
  item_unit_price numeric(12, 2);
  item_payment_status text;
  item_paid_amount numeric(12, 2);
begin
  if coalesce(jsonb_typeof(p_items), '') <> 'array' then
    raise exception 'Items must be provided as a list.';
  end if;

  if nullif(btrim(p_technician->>'name'), '') is null then
    raise exception 'Technician name is required.';
  end if;

  insert into public.technicians (name, phone)
  values (
    btrim(p_technician->>'name'),
    nullif(btrim(p_technician->>'phone'), '')
  )
  returning * into saved_technician;

  technician_id := saved_technician.id;

  for selected_item in select value from jsonb_array_elements(p_items)
  loop
    item_quantity := (selected_item->>'quantity')::integer;
    item_unit_price := nullif(selected_item->>'unit_price', '')::numeric;
    item_payment_status := coalesce(nullif(selected_item->>'payment_status', ''), 'pending');
    item_paid_amount := coalesce(nullif(selected_item->>'paid_amount', '')::numeric, 0);
    if item_quantity is null or item_quantity < 1 then
      raise exception 'Item quantities must be at least one.';
    end if;
    if item_unit_price is null or item_unit_price < 0 then
      raise exception 'A nonnegative selling price is required.';
    end if;
    if item_payment_status not in ('paid', 'partial', 'pending') then
      raise exception 'Payment status must be paid, partial or pending.';
    end if;
    if item_paid_amount < 0 then
      raise exception 'Paid amount cannot be negative.';
    end if;

    -- Custom item (typed by hand, not in inventory): no stock check, stock is not changed.
    if nullif(selected_item->>'item_id', '') is null then
      if nullif(btrim(selected_item->>'item_name'), '') is null then
        raise exception 'Type a name for each custom item.';
      end if;
      inventory_item := null;
      inventory_item.name := btrim(selected_item->>'item_name');
    else
      select * into inventory_item
      from public.inventory_items
      where id = (selected_item->>'item_id')::uuid
      for update;

      if not found then
        raise exception 'An inventory item could not be found.';
      end if;
      if inventory_item.quantity < item_quantity then
        raise exception 'Not enough stock for %; only % available.',
          inventory_item.name, inventory_item.quantity;
      end if;
    end if;

    insert into public.technician_purchases (
      technician_id, item_id, item_name, quantity, unit_price, payment_status, paid_amount
    ) values (
      technician_id,
      inventory_item.id,
      inventory_item.name,
      item_quantity,
      item_unit_price,
      item_payment_status,
      case when item_payment_status = 'partial' then item_paid_amount else 0 end
    );
  end loop;

  return saved_technician;
end;
$$;

-- ---------------------------------------------------------------------
-- Advance paid by the customer when the complaint is registered
-- ---------------------------------------------------------------------
alter table public.complaints add column if not exists advance_amount numeric(12, 2) not null default 0;
alter table public.complaints drop constraint if exists complaint_advance_amount;
alter table public.complaints add constraint complaint_advance_amount check (advance_amount >= 0);

-- ---------------------------------------------------------------------
-- Technician phone on a complaint (shown in the SMS to the customer)
-- ---------------------------------------------------------------------
alter table public.complaints add column if not exists technician_phone text;

-- Accessories received with the LED when the complaint is registered.
alter table public.complaints add column if not exists accessories text;

-- Condition of the product when it was brought in (printed on the bill book)
alter table public.complaints add column if not exists condition text;

-- ---------------------------------------------------------------------
-- Complaint numbers: plain numbers in order, starting at 93600 (93600, 93601, ...).
-- The database gives the number when a complaint is saved, so two people can't get the same one.
-- ---------------------------------------------------------------------
create sequence if not exists public.complaint_no_seq;
-- Continue after the highest number already used (or start at 93600). Safe to run again.
select setval(
  'public.complaint_no_seq',
  greatest(
    93599,
    coalesce((select max(case when complaint_no ~ '^[0-9]{1,15}$' then complaint_no::bigint end) from public.complaints), 0),
    (select case when is_called then last_value else last_value - 1 end from public.complaint_no_seq)
  )
);
alter table public.complaints alter column complaint_no set default nextval('public.complaint_no_seq')::text;

-- ---------------------------------------------------------------------
-- Payments a customer makes for a complaint (LED) after registering it.
-- A customer can pay part now and the rest on a later visit; each payment is one row.
-- (The advance paid at registration stays on complaints.advance_amount.)
-- ---------------------------------------------------------------------
create table if not exists public.customer_payments (
  id           uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints (id) on delete cascade,
  amount       numeric(12, 2) not null check (amount > 0),
  payment_date date not null default current_date,
  notes        text,
  created_at   timestamptz not null default now()
);
create index if not exists customer_payments_complaint_idx on public.customer_payments (complaint_id);

-- ---------------------------------------------------------------------
-- Invoice note (printed on the invoice)
-- ---------------------------------------------------------------------
alter table public.invoices add column if not exists notes text;

-- Warranty given on the repair, e.g. 3 + 'months' (both empty = no warranty)
alter table public.invoices add column if not exists warranty_value integer;
alter table public.invoices add column if not exists warranty_unit text;
alter table public.invoices drop constraint if exists invoice_warranty;
alter table public.invoices add constraint invoice_warranty check (
  (warranty_value is null and warranty_unit is null)
  or (warranty_value > 0 and warranty_unit in ('days', 'months', 'years'))
);

-- ---------------------------------------------------------------------
-- Shop expenses (electricity bill, food, salary, ...)
-- ---------------------------------------------------------------------
create table if not exists public.expenses (
  id           uuid primary key default gen_random_uuid(),
  expense_type text not null,
  amount       numeric(12, 2) not null check (amount >= 0),
  expense_date date not null default current_date,
  notes        text,
  created_at   timestamptz not null default now()
);
create index if not exists expenses_date_idx on public.expenses (expense_date);

-- ---------------------------------------------------------------------
-- Payments to vendors (suppliers)
-- ---------------------------------------------------------------------
create table if not exists public.vendor_payments (
  id             uuid primary key default gen_random_uuid(),
  vendor_name    text not null,
  payment_date   date not null default current_date,
  amount_paid    numeric(12, 2) not null default 0 check (amount_paid >= 0),
  amount_pending numeric(12, 2) not null default 0 check (amount_pending >= 0),
  notes          text,
  created_at     timestamptz not null default now()
);
create index if not exists vendor_payments_date_idx on public.vendor_payments (payment_date);

-- ---------------------------------------------------------------------
-- Business settings (single row)
-- ---------------------------------------------------------------------
create table if not exists public.settings (
  id            int primary key default 1 check (id = 1),
  business_name text not null default 'Awan Electronics Service Center',
  admin_name    text not null default 'Admin',
  logo_url      text,
  avatar_url    text,
  updated_at    timestamptz not null default now()
);

insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Row level security: only signed-in users can read / write anything.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['complaints','shop_purchases','invoices','inventory_items','technicians','technician_purchases','technician_payments','settings','expenses','vendor_payments','customer_payments']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "authenticated full access" on public.%I', t);
    execute format(
      'create policy "authenticated full access" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Storage bucket for logo + profile picture
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('branding', 'branding', true)
on conflict (id) do nothing;

drop policy if exists "branding read" on storage.objects;
create policy "branding read" on storage.objects
  for select using (bucket_id = 'branding');

drop policy if exists "branding write" on storage.objects;
create policy "branding write" on storage.objects
  for insert to authenticated with check (bucket_id = 'branding');

drop policy if exists "branding update" on storage.objects;
create policy "branding update" on storage.objects
  for update to authenticated using (bucket_id = 'branding');

drop policy if exists "branding delete" on storage.objects;
create policy "branding delete" on storage.objects
  for delete to authenticated using (bucket_id = 'branding');
