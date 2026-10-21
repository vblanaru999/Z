-- Replace the email below with the Supabase Auth login that should administer Bogdan Delivery LLC.
insert into it_inventory.organization_members (organization_id, user_id, role)
select
  '8882a318-cf67-4068-8cc8-792cb4314cc8',
  id,
  'admin'
from auth.users
where lower(email) = lower('YOUR-LOGIN-EMAIL@EXAMPLE.COM')
on conflict (organization_id, user_id)
do update set role = excluded.role;
