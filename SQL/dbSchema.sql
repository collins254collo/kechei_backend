
create table users (
  id            serial primary key,
  full_name     text not null,
  email         text not null unique,
  password_hash text not null,             
  role          text not null default 'staff' check (role in ('admin', 'staff')),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);


-- CLIENTS
create table clients (
  id            serial primary key,
  full_name     text not null,
  phone         text,
  nationality   text,
  notes         text,
  created_by    int references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_clients_full_name on clients (lower(full_name));
create index idx_clients_phone     on clients (phone);


-- VISITS
create table visits (
  id            serial primary key,
  client_id     int not null references clients(id) on delete cascade,
  visit_date    date not null default current_date,
  duration_days int,
  status        text not null default 'active' check (status in ('active', 'completed')),
  created_by    int references users(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_visits_client_id on visits (client_id);
create index idx_visits_status    on visits (status);


-- EXPENSES
create table expenses (
  id            serial primary key,
  visit_id      int not null references visits(id) on delete cascade,
  category      text not null check (category in ('transport', 'meals', 'massage', 'other')),
  amount        numeric(10, 2) not null check (amount >= 0),
  expense_date  date not null default current_date,
  notes         text,
  created_by    int references users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index idx_expenses_visit_id on expenses (visit_id);


-- INVOICES
create sequence invoice_number_seq start 1;

create table invoices (
  id                serial primary key,
  visit_id          int not null unique references visits(id) on delete cascade,
  invoice_number    text not null unique default ('INV-' || lpad(nextval('invoice_number_seq')::text, 4, '0')),
  total_services    numeric(10, 2) not null default 0 check (total_services >= 0),
  total_expenses    numeric(10, 2) not null default 0 check (total_expenses >= 0),
  final_amount      numeric(10, 2) not null default 0 check (final_amount >= 0),
  status            text not null default 'unpaid' check (status in ('unpaid', 'partial', 'paid')),
  created_by        int references users(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);


-- PAYMENTS
create table payments (
  id              serial primary key,
  invoice_id      int not null references invoices(id) on delete cascade,
  amount          numeric(10, 2) not null check (amount > 0),
  method          text not null check (method in ('cash', 'mpesa', 'card')),
  payment_date    date not null default current_date,
  notes           text,
  created_by      int references users(id) on delete set null,
  created_at      timestamptz not null default now()
);

create index idx_payments_invoice_id on payments (invoice_id);


-- TRIGGERS

-- updated_at maintenance
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_users_updated_at
  before update on users
  for each row execute function set_updated_at();

create trigger trg_clients_updated_at
  before update on clients
  for each row execute function set_updated_at();

create trigger trg_visits_updated_at
  before update on visits
  for each row execute function set_updated_at();

create trigger trg_invoices_updated_at
  before update on invoices
  for each row execute function set_updated_at();

-- Auto-update invoice status after every payment
create or replace function update_invoice_status()
returns trigger as $$
declare
  v_final   numeric;
  v_paid    numeric;
begin
  select final_amount into v_final
  from invoices where id = new.invoice_id;

  select coalesce(sum(amount), 0) into v_paid
  from payments where invoice_id = new.invoice_id;

  update invoices
  set
    status = case
      when v_paid >= v_final then 'paid'
      when v_paid > 0        then 'partial'
      else 'unpaid'
    end,
    updated_at = now()
  where id = new.invoice_id;

  return new;
end;
$$ language plpgsql;

create trigger trg_after_payment_insert
  after insert on payments
  for each row execute function update_invoice_status();


-- VIEWS

create or replace view client_ledger as
select
  c.id                                          as client_id,
  c.full_name,
  c.phone,
  c.nationality,
  v.id                                          as visit_id,
  v.visit_date,
  v.duration_days,
  v.status                                      as visit_status,
  i.invoice_number,
  i.total_services,
  i.total_expenses,
  i.final_amount,
  coalesce(sum(p.amount), 0)                    as total_paid,
  i.final_amount - coalesce(sum(p.amount), 0)   as balance,
  i.status                                      as payment_status
from clients c
left join visits   v on v.client_id  = c.id
left join invoices i on i.visit_id   = v.id
left join payments p on p.invoice_id = i.id
group by
  c.id, c.full_name, c.phone, c.nationality,
  v.id, v.visit_date, v.duration_days, v.status,
  i.invoice_number, i.total_services, i.total_expenses,
  i.final_amount, i.status;

-- Financial dashboard summary
create or replace view financial_summary as
select
  coalesce(sum(i.total_services), 0)                    as total_revenue,
  coalesce(sum(i.total_expenses), 0)                    as total_expenses,
  coalesce(sum(i.total_services - i.total_expenses), 0) as gross_profit,
  coalesce(sum(p.paid), 0)                              as total_collected,
  coalesce(sum(i.final_amount), 0)
    - coalesce(sum(p.paid), 0)                          as outstanding_balance
from invoices i
left join (
  select invoice_id, sum(amount) as paid
  from payments
  group by invoice_id
) p on p.invoice_id = i.id;


CREATE UNIQUE INDEX IF NOT EXISTS clients_email_unique_idx ON clients (lower(email));

ALTER TABLE visits ADD COLUMN group_id UUID NULL;
ALTER TABLE visits ADD COLUMN group_name TEXT NULL;
ALTER TABLE visits ADD COLUMN is_group_leader BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS visits_group_id_idx ON visits (group_id);

ALTER TABLE invoices ADD COLUMN group_id UUID NULL;
CREATE INDEX IF NOT EXISTS invoices_group_id_idx ON invoices (group_id);

-- insert into users (full_name, email, password_hash, role)
-- values (
--   'Admin',
--   'admin@kechei.com',
--   '$2b$10$REPLACEME_WITH_REAL_BCRYPT_HASH',
--   'admin'
-- );`