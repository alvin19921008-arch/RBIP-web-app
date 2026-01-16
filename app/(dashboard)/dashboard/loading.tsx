export default function DashboardLoading() {
  return (
    <div className="px-8 py-6">
      <div className="h-8 w-64 rounded-md bg-muted animate-pulse" />
      <div className="mt-4 grid grid-cols-12 gap-4">
        <div className="col-span-3 h-[520px] rounded-lg border border-border bg-card animate-pulse" />
        <div className="col-span-9 h-[520px] rounded-lg border border-border bg-card animate-pulse" />
      </div>
    </div>
  )
}

