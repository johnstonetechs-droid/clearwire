# notify-nearby-pros-outage

Mirror of `notify-nearby-pros` but for the `outage_reports` table.
Fires Expo push notifications on INSERT into outage_reports.

## Deploy

Run migration 0010 first (adds the RPC), then:

```sh
pnpm exec supabase functions deploy notify-nearby-pros-outage --no-verify-jwt
```

Re-uses the existing `WEBHOOK_SECRET`.

## Webhook

Dashboard → Database → Webhooks → Create:

- Name: `notify-nearby-pros-outage`
- Table: `public.outage_reports`
- Events: **INSERT**
- Method: `POST`
- URL: `https://gumgyvmtquiupuifokhx.supabase.co/functions/v1/notify-nearby-pros-outage`
- Headers:
  - `Content-Type`: `application/json`
  - `x-webhook-secret`: (same as for the damage webhook)
