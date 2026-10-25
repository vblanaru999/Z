-- Claim tables for Supabase.
-- Run this whole file once in the Supabase SQL editor (Dashboard → SQL → New query).
-- The app reads and writes these tables only from the server, with the secret key.
-- Row level security is on and no policies are granted, so the publishable key cannot read them.

create table if not exists public.claim_types (
  id bigint generated always as identity primary key,
  code text not null unique,
  label text not null,
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.drivers (
  id bigint generated always as identity primary key,
  name text not null,
  email text not null,
  default_fee_cents integer not null check (default_fee_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.driver_fee_terms (
  driver_id bigint not null references public.drivers (id) on delete cascade,
  claim_type_id bigint not null references public.claim_types (id),
  amount_cents integer not null check (amount_cents >= 0),
  primary key (driver_id, claim_type_id)
);

-- source 'manual' is written by this app. 'xcelerator' is reserved for a later import.
create table if not exists public.claims (
  id bigint generated always as identity primary key,
  driver_id bigint not null references public.drivers (id),
  claim_type_id bigint not null references public.claim_types (id),
  order_reference text,
  notes text not null,
  occurred_at timestamptz not null,
  status text not null check (status in ('recorded', 'warning_sent', 'fee_applied', 'resolved', 'waived')),
  source text not null check (source in ('manual', 'xcelerator')),
  fee_amount_cents integer,
  fee_applied_at timestamptz,
  fee_basis text check (fee_basis in ('default', 'claim_type') or fee_basis is null),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.emails (
  id bigint generated always as identity primary key,
  claim_id bigint not null references public.claims (id),
  driver_id bigint not null references public.drivers (id),
  to_address text not null,
  subject text not null,
  body text not null,
  transport text not null check (transport in ('outbox', 'smtp', 'smtp2go')),
  status text not null check (status in ('saved', 'sent', 'failed')),
  error text,
  provider_message_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create table if not exists public.claim_events (
  id bigint generated always as identity primary key,
  claim_id bigint not null references public.claims (id),
  kind text not null check (kind in ('created', 'status_change', 'email')),
  from_status text,
  to_status text,
  message text not null,
  email_id bigint references public.emails (id),
  created_at timestamptz not null default now()
);

create index if not exists idx_claims_status on public.claims (status);
create index if not exists idx_claims_driver on public.claims (driver_id);
create index if not exists idx_claims_type on public.claims (claim_type_id);
create index if not exists idx_events_claim on public.claim_events (claim_id);
create index if not exists idx_emails_claim on public.emails (claim_id);

insert into public.claim_types (code, label, description)
values
  (
    'order_not_closed',
    'Order not closed in the app',
    'The order was left open in the driver app after the stop.'
  ),
  (
    'label_not_scanned',
    'Delivery label not scanned',
    'The delivery label was not scanned at the stop.'
  ),
  (
    'poor_delivery_photo',
    'Poor or missing delivery photo attached to the order',
    'The order has no delivery photo, or the photo does not show the delivery.'
  )
on conflict (code) do update set
  label = excluded.label,
  description = excluded.description;

alter table public.claim_types enable row level security;
alter table public.drivers enable row level security;
alter table public.driver_fee_terms enable row level security;
alter table public.claims enable row level security;
alter table public.emails enable row level security;
alter table public.claim_events enable row level security;

revoke all on table public.claim_types from anon, authenticated;
revoke all on table public.drivers from anon, authenticated;
revoke all on table public.driver_fee_terms from anon, authenticated;
revoke all on table public.claims from anon, authenticated;
revoke all on table public.emails from anon, authenticated;
revoke all on table public.claim_events from anon, authenticated;

grant select, insert, update, delete on table public.claim_types to service_role;
grant select, insert, update, delete on table public.drivers to service_role;
grant select, insert, update, delete on table public.driver_fee_terms to service_role;
grant select, insert, update, delete on table public.claims to service_role;
grant select, insert, update, delete on table public.emails to service_role;
grant select, insert, update, delete on table public.claim_events to service_role;
