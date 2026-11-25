import { Field } from '@/components/ui';

export const Slug = ({ slug }: { slug: string }) => <input type="hidden" name="slug" value={slug} />;

export function TierPicker({ tiers, selected = [], name = 'tier_ids', label = 'Tiers', hint }: { tiers: any[]; selected?: string[]; name?: string; label?: string; hint?: string }) {
  return (
    <Field label={label} hint={hint || 'Leave all unticked for every tier'}>
      <div className="flex flex-wrap gap-3 rounded-lg border p-2">
        {tiers.map((t) => (
          <label key={t.id} className="flex items-center gap-1.5 text-sm"><input type="checkbox" name={name} value={t.id} defaultChecked={selected.includes(t.id)} /> {t.name}</label>
        ))}
        {!tiers.length && <span className="text-sm text-zinc-400">No tiers yet</span>}
      </div>
    </Field>
  );
}

export function VisibilitySelect({ value = 'members', allowPpv = true, name = 'visibility' }: { value?: string; allowPpv?: boolean; name?: string }) {
  return (
    <select name={name} className="input" defaultValue={value}>
      <option value="public">Public — anyone</option>
      <option value="members">All members</option>
      <option value="tiers">Selected tiers</option>
      {allowPpv && <option value="ppv">Pay-per-view / ticketed</option>}
    </select>
  );
}

export function MarkdownArea({ name, defaultValue, rows = 10, placeholder }: { name: string; defaultValue?: string | null; rows?: number; placeholder?: string }) {
  return (
    <div>
      <textarea name={name} className="input font-mono text-sm" rows={rows} defaultValue={defaultValue || ''} placeholder={placeholder} />
      <p className="hint">Markdown supported: **bold**, *italic*, # Heading, - lists, [link](https://…), ![image](url)</p>
    </div>
  );
}

export function VideoSelect({ videos, name = 'video_id', value }: { videos: any[]; name?: string; value?: string | null }) {
  return (
    <select name={name} className="input" defaultValue={value || ''}>
      <option value="">No video</option>
      {videos.map((v) => <option key={v.id} value={v.id} disabled={v.status !== 'ready'}>{v.title}{v.status !== 'ready' ? ` (${v.status})` : ''}</option>)}
    </select>
  );
}
