import type { V2PcaTrackerTooltipModel } from '@/lib/features/schedule/v2PcaTrackerTooltipModel'

interface V2PcaTrackerTooltipProps {
  model: V2PcaTrackerTooltipModel
}

export function V2PcaTrackerTooltip({ model }: V2PcaTrackerTooltipProps) {
  return (
    <div className="space-y-2" data-tooltip-variant="v2">
      <div className="border-b border-gray-700 pb-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-white">{model.title}</div>
            {model.metaLine ? <div className="mt-0.5 text-[10px] text-gray-400">{model.metaLine}</div> : null}
          </div>
          {model.reviewBadge ? (
            <div className="rounded-full border border-sky-500/20 bg-sky-950/40 px-1.5 py-0.5 text-[9px] font-medium text-sky-100">
              {model.reviewBadge}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 text-[10px] text-gray-200" data-tooltip-summary-grid="true">
        {model.summaryCells.map((cell) => (
          <div
            key={cell.label}
            className="rounded-md border border-gray-700/80 bg-gray-950/30 px-2 py-1.5"
          >
            <div className="text-[9px] uppercase tracking-wide text-gray-400">{cell.label}</div>
            <div className="mt-0.5 text-[10px] font-medium text-white">{cell.value}</div>
            {cell.subvalue ? <div className="mt-0.5 text-[10px] text-gray-400">{cell.subvalue}</div> : null}
          </div>
        ))}
      </div>

      {model.repairIssuePills.length > 0 ? (
        <div className="flex flex-wrap gap-1" data-tooltip-repair-strip="true">
          {model.repairIssuePills.map((pill) => (
            <span
              key={pill}
              className="rounded-full border border-amber-600/40 bg-amber-950/40 px-1.5 py-0.5 text-[9px] text-amber-100"
            >
              {pill}
            </span>
          ))}
        </div>
      ) : null}

      {model.gymBlockedDuplicateReliefNotices.length > 0 ? (
        <div
          className="space-y-1 rounded-md border border-amber-500/50 bg-amber-950/60 px-2 py-1.5 ring-1 ring-amber-400/25"
          data-tooltip-gym-blocked-repair="true"
        >
          <div className="text-[9px] font-semibold uppercase tracking-wide text-amber-200">Blocked repair</div>
          {model.gymBlockedDuplicateReliefNotices.map((line, i) => (
            <p key={i} className="text-[10px] leading-snug text-amber-50/95">
              {line}
            </p>
          ))}
        </div>
      ) : null}

      <div className="space-y-1 border-t border-gray-700 pt-1" data-tooltip-flat-rows="true">
        {model.rows.map((row) => (
          <div key={row.id} className="rounded-md border border-gray-800/90 bg-gray-950/20 px-2 py-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="text-[10px] font-medium text-white">
                {row.name} <span className="text-gray-400">· {row.slotLabel}</span>
              </div>
              {row.tags.length > 0 ? (
                <div className="flex flex-wrap justify-end gap-1">
                  {row.tags.map((tag) => (
                    <span
                      key={`${row.id}-${tag}`}
                      className="rounded-full border border-gray-700 bg-gray-900/70 px-1.5 py-0.5 text-[9px] text-gray-200"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="mt-1 grid grid-cols-1 gap-1 sm:grid-cols-3">
              {row.details.map((detail) => (
                <div key={`${row.id}-${detail.label}`} className="text-[10px] text-gray-200">
                  <div className="text-[9px] uppercase tracking-wide text-gray-400">{detail.label}</div>
                  <div className="mt-0.5">{detail.value}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
