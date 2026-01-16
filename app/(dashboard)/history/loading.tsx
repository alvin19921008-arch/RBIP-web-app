export default function HistoryLoading() {
  return (
    <div className="px-8 py-6">
      <div className="h-8 w-56 rounded-md bg-muted animate-pulse" />
      <div className="mt-4 space-y-3">
        <div className="h-24 rounded-lg border border-border bg-card animate-pulse" />
        <div className="h-24 rounded-lg border border-border bg-card animate-pulse" />
        <div className="h-24 rounded-lg border border-border bg-card animate-pulse" />
        <div className="h-24 rounded-lg border border-border bg-card animate-pulse" />
      </div>
    </div>
  )
}

