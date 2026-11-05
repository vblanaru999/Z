# Inbound

Inbound records one delivery as it moves through New, Confirmed, Arrived, Received, and Altered. This screen is not the claim tracker.

## Run it locally

Requires Node.js 22.13 or newer. No email setup and no seed data.

```bash
npm install
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). That page is the delivery list. Each delivery is one JSON file in `data/inbound/`, named by id (`data/inbound/1.json`, `data/inbound/2.json`). The folder is created the first time you save a delivery, and it is gitignored, so the files stay on this machine. Set `INBOUND_DATA_DIR` if they should live somewhere else. There is no login.

Production build:

```bash
npm run build
npm start
```

The claim tracker, if you open it, still uses SQLite. Set `DATABASE_PATH` if that file should live somewhere else. Inbound deliveries do not use it.

## Inbound deliveries

One delivery is one trailer, stored in its own file. It moves through these stages in order. The list and the delivery page both show the current stage.

1. **New.** The delivery is on file and has not been confirmed yet. Saving the trailer record (arrival time, carrier, trailer number, seal, BOL/PRO, PO or ASN, dock door, driver, expected pallet and piece counts, notes) starts it here.
2. **Confirmed.** The warehouse confirmed this delivery is expected.
3. **Arrived.** The trailer is at the dock and has not been received.
4. **Received.** The freight was unloaded, counted, sorted, and put away. This records who unloaded it, start and finish times, received counts against the expected counts, the sort outcome, putaway locations, and any damage, shortage, or overage.
5. **Altered.** The delivery was changed after it was received. A note says what changed.

A delivery cannot skip a stage.

## Claim tracker

The same repository still has the older claim tracker for delivery procedure misses. It is separate from inbound. Open [http://localhost:3000/open](http://localhost:3000/open) for that board. Data entry there is manual. Each claim has a `source`: `manual` today, with `xcelerator` reserved for a later import. This app does not talk to Xcelerator.

Optional sample drivers and one recorded claim:

```bash
npm run db:seed
```

## What you can do

1. Add a driver: name, email, a default contract fee, and an optional fee for each claim type.
2. Record a claim: driver, claim type, optional order reference, what went wrong, and when it happened. Recording does not send email.
3. Open the claim and send the warning. With `SMTP2GO_API_KEY` set, the message goes through SMTP2GO and the claim becomes **Warning sent** only after SMTP2GO accepts it. Without that key, SMTP is used when it is fully configured. Otherwise the message is saved in the claim's outbox and the status becomes **Warning sent**.
4. Apply the contract fee. The amount is the claim-type fee when one is stored, otherwise the driver's default. The amount is copied onto the claim.
5. Resolve the claim after the fee, or waive it earlier to close with no fee.

Seeded claim types:

- Order not closed in the app
- Delivery label not scanned
- Poor or missing delivery photo attached to the order

## Email

SMTP2GO is preferred when its API key is set. The app POSTs to `https://api.smtp2go.com/v3/email/send` with the key in `X-Smtp2go-Api-Key`.

| Variable | Purpose |
| --- | --- |
| `SMTP2GO_API_KEY` | API key. Leave empty to skip SMTP2GO. |
| `SMTP2GO_FROM` | From address. Defaults to `claim@bogdandelivery.com`. |

A successful send stores the SMTP2GO email id on the claim. A failed send stays on the claim with SMTP2GO's error, and the status stays **Recorded**.

If the API key is empty, SMTP is the fallback. Set all three of these:

| Variable | Purpose |
| --- | --- |
| `SMTP_HOST` | SMTP server hostname |
| `SMTP_PORT` | Port, such as `587` or `465` |
| `SMTP_FROM` | From address |

Optional:

| Variable | Purpose |
| --- | --- |
| `SMTP_USER` | Username. Omit for a server that does not need auth. |
| `SMTP_PASS` | Password. |
| `SMTP_SECURE` | `true` or `false`. When empty, `true` only for port 465. |

If only some of `SMTP_HOST`, `SMTP_PORT`, and `SMTP_FROM` are set, sending fails with an error instead of quietly saving to the outbox. A failed SMTP attempt stays on the claim as a failed outbox row, and the claim stays **Recorded** so you can try again.

Copy `.env.example` to `.env`. Next.js loads it automatically. Do not commit secrets. `.env` is gitignored.

## Tests

```bash
npm test
```

The tests cover the status path (including blocked steps), fee selection, the outbox, SMTP, and mocked SMTP2GO success and failure. They do not open a network connection.

## Intentionally later

- Xcelerator import. The `source` column already allows `xcelerator`; nothing writes it yet.
- Automatic detection of misses.
- Automatic fees, payroll, or card charges. A person applies the stored contract amount by hand.

## Assumptions

- The repository was empty, so this is a Next.js app with TypeScript and SQLite.
- Fees are USD amounts stored as cents. There is no payment provider and no legal clause beyond the fee record.
- A warning is required before a fee. Waive closes a claim with no fee from Recorded or Warning sent. Resolve closes it after the fee is applied.
- When neither SMTP2GO nor SMTP is configured, saving the warning in the outbox counts as the warning step.
- There is no authentication. Anyone who can open the app can record claims and send mail.
- Times are stored in UTC and shown in the server's local timezone.
