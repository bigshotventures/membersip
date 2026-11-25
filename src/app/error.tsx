'use client';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="text-5xl">⚠️</div>
      <h1 className="text-xl font-bold">Something went wrong</h1>
      <p className="max-w-md text-sm text-zinc-600">{error.message?.length < 200 ? error.message : 'An unexpected error occurred.'}</p>
      <div className="flex gap-2"><button onClick={reset} className="btn-dark">Try again</button><button onClick={() => history.back()} className="btn-outline">Go back</button></div>
    </main>
  );
}
