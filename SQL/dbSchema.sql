-- ENUMS

create type visit_status as enum ('active', 'completed', 'cancelled');
create type payment_method as enum ('cash', 'mpesa', 'card');
create type charge_type as enum ('service');

-- CLIENTS

create table clients (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null,
  phone        text not null unique,
  nationality  text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- VISITS

create table visits (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references clients(id) on delete restrict,
  check_in_date  date not null,
  check_out_date date,
  status         visit_status not null default 'active',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz,

  constraint check_out_after_check_in
    check (check_out_date is null or check_out_date >= check_in_date)
);

-- CHARGES

create table charges (
  id          uuid primary key default gen_random_uuid(),
  visit_id    uuid not null references visits(id) on delete restrict,
  type        charge_type not null default 'service',
  category    text not null,            -- transport, meals, therapy, etc.
  amount      numeric(12, 2) not null,
  description text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,

  constraint charges_amount_positive check (amount > 0)
);

-- PAYMENTS

create table payments (
  id          uuid primary key default gen_random_uuid(),
  visit_id    uuid not null references visits(id) on delete restrict,
  amount      numeric(12, 2) not null,
  method      payment_method not null,
  reference   text,                     -- for mpesa / card transactions
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,

  constraint payments_amount_positive check (amount > 0)
);

-- GLOBAL EXPENSES

create table global_expenses (
  id          uuid primary key default gen_random_uuid(),
  category    text not null,            -- fuel, maintenance, equipment, etc.
  amount      numeric(12, 2) not null,
  date        date not null,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,

  constraint global_expenses_amount_positive check (amount > 0)
);

-- INDEXES

-- clients
create index idx_clients_phone       on clients(phone)      where deleted_at is null;
create index idx_clients_deleted_at  on clients(deleted_at);

-- visits
create index idx_visits_client_id    on visits(client_id)   where deleted_at is null;
create index idx_visits_status       on visits(status)      where deleted_at is null;
create index idx_visits_check_in     on visits(check_in_date);

-- charges
create index idx_charges_visit_id    on charges(visit_id)   where deleted_at is null;
create index idx_charges_category    on charges(category);

-- payments
create index idx_payments_visit_id   on payments(visit_id)  where deleted_at is null;
create index idx_payments_method     on payments(method);

-- global_expenses
create index idx_global_expenses_date     on global_expenses(date);
create index idx_global_expenses_category on global_expenses(category);

-- AUTO-UPDATE updated_at via TRIGGER

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_clients_updated_at
  before update on clients
  for each row execute function set_updated_at();

create trigger trg_visits_updated_at
  before update on visits
  for each row execute function set_updated_at();

create trigger trg_charges_updated_at
  before update on charges
  for each row execute function set_updated_at();

create trigger trg_payments_updated_at
  before update on payments
  for each row execute function set_updated_at();

create trigger trg_global_expenses_updated_at
  before update on global_expenses
  for each row execute function set_updated_at();

-- ROW LEVEL SECURITY (enable & lock down by default)

alter table clients         enable row level security;
alter table visits          enable row level security;
alter table charges         enable row level security;
alter table payments        enable row level security;
alter table global_expenses enable row level security;


create policy "authenticated users can read clients"
  on clients for select to authenticated
  using (deleted_at is null);

create policy "authenticated users can read visits"
  on visits for select to authenticated
  using (deleted_at is null);

create policy "authenticated users can read charges"
  on charges for select to authenticated
  using (deleted_at is null);

create policy "authenticated users can read payments"
  on payments for select to authenticated
  using (deleted_at is null);

create policy "authenticated users can read global_expenses"
  on global_expenses for select to authenticated
  using (deleted_at is null);