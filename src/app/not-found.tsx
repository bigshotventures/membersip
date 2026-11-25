import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="text-6xl">🔍</div>
      <h1 className="text-2xl font-bold">Page not found</h1>
      <p className="text-zinc-500">The page you're looking for doesn't exist or isn't public yet.</p>
      <Link href="/" className="btn-dark">Go home</Link>
    </main>
  );
}
