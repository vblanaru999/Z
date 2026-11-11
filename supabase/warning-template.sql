-- Add the warning email template to a database that already ran schema.sql.
-- Safe to run more than once. It does not replace a template you already saved.

create table if not exists public.warning_template (
  id integer primary key check (id = 1),
  subject text not null,
  body text not null,
  updated_at timestamptz not null default now()
);

insert into public.warning_template (id, subject, body)
values (
  1,
  'Warning: {{claimType}}',
  $warning$Hello {{driver}},

This is a formal warning. A delivery procedure was not followed.

What was not done: {{claimType}}
When: {{when}}
{{orderLine}}What went wrong: {{notes}}

This message is a warning. It does not apply a fee. Repeated issues can incur the fee in your contract.
{{feeSentence}}

Reference: claim {{claimId}}$warning$
)
on conflict (id) do nothing;

alter table public.warning_template enable row level security;
revoke all on table public.warning_template from anon, authenticated;
grant select, insert, update, delete on table public.warning_template to service_role;
