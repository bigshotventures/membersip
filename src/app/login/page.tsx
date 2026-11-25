import { LoginForm } from './LoginForm';
import { APP_NAME } from '@/lib/utils';
import Link from 'next/link';

export const metadata = { title: 'Sign in' };

export default function LoginPage({ searchParams }: { searchParams: { next?: string; error?: string } }) {
  const next = searchParams.next && searchParams.next.startsWith('/') && !searchParams.next.startsWith('//') ? searchParams.next : '/me';
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 block text-center text-xl font-bold">{APP_NAME}</Link>
        <div className="card p-6">
          <h1 className="text-lg font-semibold">Sign in or create an account</h1>
          <p className="mb-5 mt-1 text-sm text-zinc-500">We'll send you a one-time code. No password needed.</p>
          {searchParams.error && <p className="mb-3 rounded bg-red-50 p-2 text-sm text-red-700">{searchParams.error}</p>}
          <LoginForm next={next} />
        </div>
      </div>
    </main>
  );
}
