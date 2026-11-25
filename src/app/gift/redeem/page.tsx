import { SiteHeader } from '@/components/layout/SiteHeader';
import { Notice } from '@/components/ui';
import { SubmitButton } from '@/components/client';
import { redeemGiftAction } from '@/actions/account';

export const metadata = { title: 'Redeem your gift' };

export default function Redeem({ searchParams }: { searchParams: { code?: string; error?: string } }) {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="text-6xl">🎁</div>
        <h1 className="mt-4 text-2xl font-bold">Redeem your gift</h1>
        <p className="mt-2 text-zinc-600">Sign in (or create a free account) and your gift will be added instantly.</p>
        {searchParams.error && <div className="mt-4"><Notice tone="error">{searchParams.error}</Notice></div>}
        <form action={redeemGiftAction} className="mt-6 flex gap-2">
          <input name="code" defaultValue={searchParams.code} className="input text-center uppercase tracking-widest" placeholder="GIFT CODE" required />
          <SubmitButton>Redeem</SubmitButton>
        </form>
      </main>
    </>
  );
}
