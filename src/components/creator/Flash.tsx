import { Notice } from '@/components/ui';

export function Flash({ sp }: { sp: { notice?: string; error?: string; [k: string]: any } }) {
  return (
    <>
      {sp.notice && <div className="mb-4"><Notice tone="success">{sp.notice}</Notice></div>}
      {sp.error && <div className="mb-4"><Notice tone="error">{sp.error}</Notice></div>}
    </>
  );
}
