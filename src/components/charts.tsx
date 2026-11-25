import { inr } from '@/lib/utils';

/** Tiny dependency-free SVG bar chart for dashboards. */
export function BarChart({ data, money = false, height = 160 }: { data: { label: string; value: number }[]; money?: boolean; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const w = 100 / Math.max(1, data.length);
  return (
    <div>
      <svg viewBox={`0 0 100 ${height / 4}`} className="w-full" style={{ height }} preserveAspectRatio="none" role="img">
        {data.map((d, i) => {
          const h = (d.value / max) * (height / 4 - 2);
          return (
            <rect key={i} x={i * w + w * 0.15} y={height / 4 - h} width={w * 0.7} height={h} rx={0.6} fill="var(--accent)" opacity={d.value ? 0.9 : 0.15}>
              <title>{`${d.label}: ${money ? inr(d.value) : d.value}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-zinc-400">
        <span>{data[0]?.label}</span><span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

export function HBar({ rows, money = false }: { rows: { label: string; value: number }[]; money?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.label}>
          <div className="flex justify-between text-sm"><span>{r.label}</span><span className="font-medium">{money ? inr(r.value) : r.value}</span></div>
          <div className="mt-1 h-2 rounded bg-zinc-100"><div className="h-2 rounded accent-bg" style={{ width: `${(r.value / max) * 100}%` }} /></div>
        </div>
      ))}
      {!rows.length && <p className="text-sm text-zinc-500">No data yet</p>}
    </div>
  );
}
