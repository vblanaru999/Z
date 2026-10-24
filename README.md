# Claim

Claim is a small operations app for delivery procedure misses. A person records what a driver did incorrectly, sends a formal warning email, and can later apply the fee already stored on that driver's contract.

Data entry is manual. Each claim has a `source`: `manual` today, with `xcelerator` reserved for a later import. This app does not talk to Xcelerator.

## Run it

Requires Node.js 22.13 or newer (it uses the built-in `node:sqlite` module).

```bash
npm install
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The database is created at `data/claim.db` on first use, with the three claim types already loaded. There is no login.

Optional sample drivers and one recorded claim:

```bash
npm run db:seed
```

Production build:

```bash
npm run build
npm start
```

Set `DATABASE_PATH` if the SQLite file should live somewhere other than `data/claim.db`.

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
