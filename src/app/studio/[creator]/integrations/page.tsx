import { cookies } from 'next/headers';
import { requireStudio } from '@/lib/auth';
import { admin } from '@/lib/supabase/admin';
import { Card, Field, Notice, PageHeader, ReadOnlyNotice } from '@/components/ui';
import { CopyButton, SubmitButton } from '@/components/client';
import { Slug } from '@/components/studio/bits';
import { addWebhook, createApiKey, deleteWebhook, revokeApiKey } from '@/actions/studio/commerce';
import { EVENT_LABELS } from '@/lib/events';
import { APP_URL, fmtDate, timeAgo } from '@/lib/utils';

export default async function Integrations({ params, searchParams }: { params: { creator: string }; searchParams: { notice?: string } }) {
  const { creator, perms } = await requireStudio(params.creator);
  const db = admin();
  const newKey = cookies().get('new_api_key')?.value;
  const [{ data: hooks }, { data: keys }, { data: deliveries }] = await Promise.all([
    db.from('webhook_endpoints').select('*').eq('creator_id', creator.id),
    db.from('api_keys').select('*').eq('creator_id', creator.id).is('revoked_at', null),
    db.from('webhook_deliveries').select('*, endpoint:webhook_endpoints!inner(url, creator_id)').eq('endpoint.creator_id', creator.id).order('created_at', { ascending: false }).limit(15),
  ]);
  const slug = creator.slug;
  return (
    <div className="space-y-6">
      <PageHeader title="Webhooks & API" subtitle="Connect Zapier, Make, Google Sheets, your CRM or your own code" />
      {searchParams.notice && <Notice tone="success">{searchParams.notice}</Notice>}
      {newKey && <Notice tone="warn"><div className="flex flex-wrap items-center gap-2">Your new API key: <code className="rounded bg-white px-2 py-1">{newKey}</code><CopyButton text={newKey} /></div></Notice>}
      {!perms.manage && <ReadOnlyNotice />}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Outgoing webhooks">
          <p className="mb-3 text-sm text-zinc-600">We POST JSON to your URL. Verify with the <code>X-CreatorHub-Signature</code> header (HMAC-SHA256 of the body with your secret). Works with "Webhooks by Zapier".</p>
          {(hooks || []).map((h: any) => (
            <div key={h.id} className="mb-2 rounded border p-2 text-sm">
              <div className="truncate font-mono text-xs">{h.url}</div>
              <div className="text-xs text-zinc-500">{h.events.length ? h.events.join(', ') : 'all events'}</div>
              <div className="mt-1 flex items-center gap-2"><CopyButton text={h.secret} label="Copy secret" />{perms.manage && <form action={deleteWebhook}><Slug slug={slug} /><input type="hidden" name="id" value={h.id} /><button className="text-xs text-red-600">Remove</button></form>}</div>
            </div>
          ))}
          {perms.manage && (
            <form action={addWebhook} className="mt-3 space-y-2"><Slug slug={slug} />
              <input name="url" className="input" placeholder="https://hooks.zapier.com/hooks/catch/…" required />
              <div className="flex flex-wrap gap-2">{Object.entries(EVENT_LABELS).map(([k, v]) => <label key={k} className="flex items-center gap-1 text-xs"><input type="checkbox" name="events" value={k} /> {v}</label>)}</div>
              <SubmitButton className="btn-outline">Add webhook</SubmitButton>
            </form>
          )}
        </Card>
        <Card title="API keys">
          <p className="mb-3 text-sm text-zinc-600">REST API at <code>{APP_URL}/api/v1</code>. Send <code>Authorization: Bearer &lt;key&gt;</code>. Endpoints: <code>GET /members</code>, <code>GET /orders</code>, <code>GET /posts</code>, <code>POST /posts</code>.</p>
          {(keys || []).map((k: any) => (
            <div key={k.id} className="flex items-center justify-between border-b py-1.5 text-sm"><span>{k.name} <code className="text-xs">{k.prefix}…</code><span className="ml-2 text-xs text-zinc-500">{k.last_used_at ? `used ${timeAgo(k.last_used_at)}` : `created ${fmtDate(k.created_at)}`}</span></span>
              {perms.manage && <form action={revokeApiKey}><Slug slug={slug} /><input type="hidden" name="id" value={k.id} /><SubmitButton className="btn-ghost btn-sm text-red-600" confirm="Revoke this key?">Revoke</SubmitButton></form>}</div>
          ))}
          {perms.manage && <form action={createApiKey} className="mt-3 flex gap-2"><Slug slug={slug} /><input name="name" className="input" placeholder="Key name" /><SubmitButton className="btn-outline">Create key</SubmitButton></form>}
        </Card>
      </div>
      <Card title="Recent webhook deliveries">
        {(deliveries || []).map((d: any) => <div key={d.id} className="flex justify-between border-b py-1 text-sm last:border-0"><span>{d.event} → <span className="font-mono text-xs">{d.endpoint.url.slice(0, 40)}</span></span><span className={d.status_code && d.status_code < 300 ? 'text-emerald-700' : 'text-red-600'}>{d.status_code || d.error}</span></div>)}
        {!deliveries?.length && <p className="text-sm text-zinc-500">Nothing sent yet</p>}
      </Card>
    </div>
  );
}
