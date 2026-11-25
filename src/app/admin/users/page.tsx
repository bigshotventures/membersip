import { admin } from '@/lib/supabase/admin';
import { Notice, PageHeader } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { setUserRole } from '@/actions/admin';
import { fmtDate } from '@/lib/utils';

export default async function Users({ searchParams }: { searchParams: { q?: string; notice?: string } }) {
  let q = admin().from('profiles').select('id, full_name, email, phone, role, created_at').order('created_at', { ascending: false }).limit(200);
  if (searchParams.q) q = q.or(`email.ilike.%${searchParams.q.replace(/[%,()]/g, '')}%,full_name.ilike.%${searchParams.q.replace(/[%,()]/g, '')}%,phone.ilike.%${searchParams.q.replace(/[%,()]/g, '')}%`);
  const { data } = await q;
  return (
    <div className="space-y-4">
      <PageHeader title="Users" subtitle="Admins can promote team members. Team = full access to all creator studios." />
      {searchParams.notice && <Notice tone="success">{searchParams.notice}</Notice>}
      <form className="flex gap-2"><input name="q" className="input w-72" defaultValue={searchParams.q} placeholder="Search email, name or phone" /><button className="btn-dark">Search</button></form>
      <div className="card overflow-x-auto"><table className="table"><thead><tr><th>User</th><th>Phone</th><th>Joined</th><th>Role</th></tr></thead>
        <tbody>{(data || []).map((u: any) => (
          <tr key={u.id}><td>{u.full_name}<div className="text-xs text-zinc-500">{u.email}</div></td><td className="text-sm">{u.phone}</td><td className="text-sm">{fmtDate(u.created_at)}</td>
            <td><form action={setUserRole} className="flex gap-1"><input type="hidden" name="id" value={u.id} /><select name="role" defaultValue={u.role} className="input py-1 text-xs">{['member', 'creator', 'team', 'admin'].map((r) => <option key={r}>{r}</option>)}</select><SubmitButton className="btn-ghost btn-sm">Set</SubmitButton></form></td></tr>
        ))}</tbody></table></div>
    </div>
  );
}
