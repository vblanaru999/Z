# Bogdan IT Manager — V1

A lightweight internal web interface for the `it_inventory` schema in Supabase project `tdkgyelajhjwybgezncu`.

## Included screens

- Dashboard
- Assets
- Add / Edit Asset
- Subscriptions
- Add / Edit Subscription
- Locations
- Add / Edit Location
- Email/password sign-in through Supabase Auth

The app uses the Supabase publishable key in `config.js`. This key is intended for frontend use. Authorization is enforced by the existing Row Level Security policies.

## 1. Expose the custom schema to the Data API

In the Supabase Dashboard for this project, open the Data API settings and add:

`it_inventory`

to the list of exposed schemas. The schema already grants `authenticated` usage/table access and has RLS enabled.

## 2. Create or choose a Supabase Auth user

In Supabase Dashboard → Authentication → Users, create the employee/admin login you want to use, or use an existing login.

## 3. Add that user to Bogdan Delivery LLC

Run this in Supabase SQL Editor after replacing the email placeholder:

```sql
insert into it_inventory.organization_members (organization_id, user_id, role)
select
  '8882a318-cf67-4068-8cc8-792cb4314cc8',
  id,
  'admin'
from auth.users
where lower(email) = lower('YOUR-LOGIN-EMAIL@EXAMPLE.COM')
on conflict (organization_id, user_id)
do update set role = excluded.role;
```

Roles supported by the current database design: `admin`, `editor`, `viewer`.

## 4. Run locally

Because the app is plain HTML/CSS/JavaScript, no build step is required.

From this folder:

```bash
python3 -m http.server 8080
```

Then open:

`http://localhost:8080`

Do not open `index.html` directly with `file://`; serving it over HTTP is more reliable.

## 5. Deploy

You can deploy these four files to a static host such as Cloudflare Pages, Netlify, Vercel static hosting, Azure Static Web Apps, or an internal web server:

- `index.html`
- `styles.css`
- `app.js`
- `config.js`

No service-role key or database password should ever be added to the frontend.

## Current V1 behavior

- Dashboard KPIs are calculated from live `assets`, `subscriptions`, and `locations` records.
- Assets can be searched, added, and edited.
- Subscriptions can be searched, added, and edited.
- Locations can be added and edited.
- Vendor selection is supported when vendor rows exist in `it_inventory.vendors`.
- Subscription monthly run rate is normalized based on billing frequency.
- Upcoming subscription renewals, cancellation deadlines, and asset warranty expirations appear on the dashboard.

## Recommended V2

- Vendors page + quick-add vendor
- Employees / people page
- Asset assignment and return workflow
- QR code generation/scanning
- Receipt and asset-photo uploads through Supabase Storage
- Software license seat assignments
- Maintenance / repair records
- Role management page
- Delete/archive confirmation flows
