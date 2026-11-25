import { admin } from '@/lib/supabase/admin';
import { PageHeader } from '@/components/ui';
import { fmtDate } from '@/lib/utils';

export default async function Audit() {
  const { data } = await admin().from('audit_log').select('*, actor:profiles(full_name), creator:creators(name)').order('created_at', { ascending: false }).limit(300);
  return (
    <div>
      <PageHeader title="Audit log" subtitle="Who changed what" />
      <div className="card overflow-x-auto"><table className="table"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Creator</th><th>Details</th></tr></thead>
        <tbody>{(data || []).map((a: any) => <tr key={a.id}><td className="text-sm">{fmtDate(a.created_at, true)}</td><td>{a.actor?.full_name}</td><td className="font-mono text-xs">{a.action}</td><td>{a.creator?.name}</td><td className="font-mono text-[10px] text-zinc-500">{a.entity} {a.entity_id} {Object.keys(a.meta || {}).length ? JSON.stringify(a.meta) : ''}</td></tr>)}</tbody></table></div>
    </div>
  );
}
