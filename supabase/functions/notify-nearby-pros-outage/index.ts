// Supabase Edge Function: notify-nearby-pros-outage
//
// Triggered by a Database Webhook on INSERT into public.outage_reports.
// Sends Expo push notifications to pros whose last_known_location is
// within their alert_radius of the service location. Mirrors the
// notify-nearby-pros function but for outage reports.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH_SIZE = 100;

const SERVICE_LABELS: Record<string, string> = {
  internet: 'Internet',
  cable_tv: 'Cable TV',
  phone: 'Phone',
  electric: 'Electric',
  water: 'Water',
  other: 'Service',
};

type WebhookPayload = {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record?: {
    id?: string;
    is_test?: boolean;
    service_type?: string;
    provider_company?: string;
  };
};

type ProMatch = {
  id: string;
  display_name: string | null;
  expo_push_token: string;
  distance_miles: number;
};

Deno.serve(async (req) => {
  try {
    const expectedSecret = Deno.env.get('WEBHOOK_SECRET');
    if (expectedSecret) {
      if (req.headers.get('x-webhook-secret') !== expectedSecret) {
        return new Response('Unauthorized', { status: 401 });
      }
    }

    const payload = (await req.json()) as WebhookPayload;
    if (payload.type !== 'INSERT' || payload.table !== 'outage_reports') {
      return json({ skipped: 'not an INSERT on outage_reports' });
    }

    const record = payload.record;
    if (!record?.id) return json({ error: 'record.id missing' }, 400);
    if (record.is_test) return json({ skipped: 'test outage' });

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    const { data, error } = await supabase.rpc('pros_within_radius_of_outage', {
      p_outage_id: record.id,
    });

    if (error) {
      console.error('RPC error:', error);
      return json({ error: error.message }, 500);
    }

    const pros = (data ?? []) as ProMatch[];
    const service = SERVICE_LABELS[record.service_type ?? 'other'] ?? 'Service';
    const provider = record.provider_company ?? 'unknown provider';

    const messages = pros
      .filter((p) => typeof p.expo_push_token === 'string' && p.expo_push_token.length > 0)
      .map((p) => ({
        to: p.expo_push_token,
        title: 'Outage reported nearby',
        body: `${provider} · ${service} · ${Number(p.distance_miles).toFixed(1)} mi away`,
        sound: 'default',
        priority: 'high',
        data: { outageId: record.id },
      }));

    let sent = 0;
    const pushErrors: unknown[] = [];
    for (let i = 0; i < messages.length; i += EXPO_BATCH_SIZE) {
      const batch = messages.slice(i, i + EXPO_BATCH_SIZE);
      try {
        const res = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'Accept-Encoding': 'gzip, deflate',
          },
          body: JSON.stringify(batch),
        });
        if (res.ok) sent += batch.length;
        else pushErrors.push({ status: res.status, body: await res.text() });
      } catch (e) {
        pushErrors.push({ thrown: String(e) });
      }
    }

    return json({ sent, candidates: pros.length, errors: pushErrors });
  } catch (e) {
    console.error('notify-nearby-pros-outage failure:', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
