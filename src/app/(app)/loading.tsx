export default function AppLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Seite lädt">
      <div className="space-y-3">
        <div className="h-3 w-24 rounded bg-black/10" />
        <div className="h-8 w-64 max-w-full rounded bg-black/10" />
        <div className="h-4 w-full max-w-md rounded bg-black/5" />
      </div>
      <div className="card space-y-3 p-5">
        <div className="h-4 w-1/3 rounded bg-black/10" />
        <div className="h-4 w-full rounded bg-black/5" />
        <div className="h-4 w-5/6 rounded bg-black/5" />
        <div className="h-4 w-2/3 rounded bg-black/5" />
      </div>
      <div className="card space-y-3 p-5">
        <div className="h-4 w-1/4 rounded bg-black/10" />
        <div className="h-4 w-full rounded bg-black/5" />
        <div className="h-4 w-4/5 rounded bg-black/5" />
      </div>
    </div>
  );
}
