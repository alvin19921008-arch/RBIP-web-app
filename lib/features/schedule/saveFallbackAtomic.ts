type QueryErrorLike = {
  message?: string
  code?: string
}

type FallbackSupabaseLike = {
  from: (table: string) => any
}

export type FallbackSaveRowsPayload = {
  therapistRows: any[]
  pcaRows: any[]
  bedRows: any[]
  calcRows: any[]
}

export type FallbackSaveMetadataPayload = {
  tieBreakDecisions: Record<string, any>
  staffOverrides: Record<string, any>
  workflowState: Record<string, any>
}

type FallbackSaveSnapshot = {
  pcaRows: any[]
  therapistRows: any[]
  bedRows: any[]
  calcRows: any[]
  metadata: {
    tieBreakDecisions: any
    staffOverrides: any
    workflowState: any
  }
}

export type FallbackSaveExecutionResult<TValue> =
  | {
      ok: true
      value: TValue
      rollbackAttempted: false
      rollbackError: null
    }
  | {
      ok: false
      stage: 'capture' | 'rows' | 'metadata'
      error: QueryErrorLike | Error | unknown
      rollbackAttempted: boolean
      rollbackError: QueryErrorLike | Error | unknown | null
    }

export async function executeFallbackSaveWithRollback<TSnapshot, TValue>(args: {
  captureSnapshot: () => Promise<{ snapshot: TSnapshot } | { error: unknown }>
  writeRows: () => Promise<{ ok: true } | { error: unknown }>
  writeMetadata: () => Promise<{ value: TValue } | { error: unknown }>
  restoreSnapshot: (snapshot: TSnapshot) => Promise<{ ok: true } | { error: unknown }>
}): Promise<FallbackSaveExecutionResult<TValue>> {
  const captured = await args.captureSnapshot()
  if ('error' in captured) {
    return {
      ok: false,
      stage: 'capture',
      error: captured.error,
      rollbackAttempted: false,
      rollbackError: null,
    }
  }

  const rollback = async (): Promise<QueryErrorLike | Error | unknown | null> => {
    const restored = await args.restoreSnapshot(captured.snapshot)
    return 'error' in restored ? restored.error : null
  }

  const rows = await args.writeRows()
  if ('error' in rows) {
    const rollbackError = await rollback()
    return {
      ok: false,
      stage: 'rows',
      error: rows.error,
      rollbackAttempted: true,
      rollbackError,
    }
  }

  const metadata = await args.writeMetadata()
  if ('error' in metadata) {
    const rollbackError = await rollback()
    return {
      ok: false,
      stage: 'metadata',
      error: metadata.error,
      rollbackAttempted: true,
      rollbackError,
    }
  }

  return {
    ok: true,
    value: metadata.value,
    rollbackAttempted: false,
    rollbackError: null,
  }
}

function firstResultError(results: any[]): QueryErrorLike | null {
  const withError = results.find((result) => (result as any)?.error)
  return withError ? ((withError as any).error as QueryErrorLike) : null
}

async function captureFallbackSaveSnapshot(args: {
  supabase: FallbackSupabaseLike
  scheduleId: string
}): Promise<{ snapshot: FallbackSaveSnapshot } | { error: QueryErrorLike | unknown }> {
  const [pcaRes, therapistRes, bedRes, calcRes, metadataRes] = await Promise.all([
    args.supabase.from('schedule_pca_allocations').select('*').eq('schedule_id', args.scheduleId),
    args.supabase.from('schedule_therapist_allocations').select('*').eq('schedule_id', args.scheduleId),
    args.supabase.from('schedule_bed_allocations').select('*').eq('schedule_id', args.scheduleId),
    args.supabase.from('schedule_calculations').select('*').eq('schedule_id', args.scheduleId),
    args.supabase
      .from('daily_schedules')
      .select('tie_break_decisions, staff_overrides, workflow_state')
      .eq('id', args.scheduleId)
      .single(),
  ])

  const readError = firstResultError([pcaRes, therapistRes, bedRes, calcRes, metadataRes])
  if (readError) return { error: readError }

  return {
    snapshot: {
      pcaRows: ((pcaRes as any)?.data || []) as any[],
      therapistRows: ((therapistRes as any)?.data || []) as any[],
      bedRows: ((bedRes as any)?.data || []) as any[],
      calcRows: ((calcRes as any)?.data || []) as any[],
      metadata: {
        tieBreakDecisions: (metadataRes as any)?.data?.tie_break_decisions ?? null,
        staffOverrides: (metadataRes as any)?.data?.staff_overrides ?? null,
        workflowState: (metadataRes as any)?.data?.workflow_state ?? null,
      },
    },
  }
}

async function writeFallbackRows(args: {
  supabase: FallbackSupabaseLike
  scheduleId: string
  rows: FallbackSaveRowsPayload
}): Promise<{ ok: true } | { error: QueryErrorLike | unknown }> {
  const upsertPromises: PromiseLike<any>[] = []
  if ((args.rows.calcRows || []).length > 0) {
    upsertPromises.push(
      args.supabase.from('schedule_calculations').upsert(args.rows.calcRows, { onConflict: 'schedule_id,team' })
    )
  }

  const [pcaDeleteRes, therapistDeleteRes, bedDeleteRes, ...upsertResults] = await Promise.all([
    args.supabase.from('schedule_pca_allocations').delete().eq('schedule_id', args.scheduleId),
    args.supabase.from('schedule_therapist_allocations').delete().eq('schedule_id', args.scheduleId),
    args.supabase.from('schedule_bed_allocations').delete().eq('schedule_id', args.scheduleId),
    ...upsertPromises,
  ])

  const firstWriteError =
    (pcaDeleteRes as any)?.error ||
    (therapistDeleteRes as any)?.error ||
    (bedDeleteRes as any)?.error ||
    upsertResults.find((result) => (result as any)?.error)?.error
  if (firstWriteError) return { error: firstWriteError }

  if ((args.rows.pcaRows || []).length > 0) {
    const pcaInsertRes = await args.supabase.from('schedule_pca_allocations').insert(args.rows.pcaRows)
    if ((pcaInsertRes as any)?.error) return { error: (pcaInsertRes as any).error }
  }

  if ((args.rows.therapistRows || []).length > 0) {
    const therapistInsertRes = await args.supabase.from('schedule_therapist_allocations').insert(args.rows.therapistRows)
    if ((therapistInsertRes as any)?.error) return { error: (therapistInsertRes as any).error }
  }

  if ((args.rows.bedRows || []).length > 0) {
    const bedInsertRes = await args.supabase.from('schedule_bed_allocations').insert(args.rows.bedRows)
    if ((bedInsertRes as any)?.error) return { error: (bedInsertRes as any).error }
  }

  return { ok: true }
}

async function writeFallbackMetadata(args: {
  supabase: FallbackSupabaseLike
  scheduleId: string
  metadata: FallbackSaveMetadataPayload
}): Promise<{ value: { updatedAt: string | null } } | { error: QueryErrorLike | unknown }> {
  const { data, error } = await args.supabase
    .from('daily_schedules')
    .update({
      tie_break_decisions: args.metadata.tieBreakDecisions,
      staff_overrides: args.metadata.staffOverrides,
      workflow_state: args.metadata.workflowState,
    })
    .eq('id', args.scheduleId)
    .select('updated_at')
    .single()
  if (error) return { error }
  return { value: { updatedAt: (data as any)?.updated_at ?? null } }
}

async function restoreFallbackSaveSnapshot(args: {
  supabase: FallbackSupabaseLike
  scheduleId: string
  snapshot: FallbackSaveSnapshot
}): Promise<{ ok: true } | { error: QueryErrorLike | unknown }> {
  const deleteResults = await Promise.all([
    args.supabase.from('schedule_pca_allocations').delete().eq('schedule_id', args.scheduleId),
    args.supabase.from('schedule_therapist_allocations').delete().eq('schedule_id', args.scheduleId),
    args.supabase.from('schedule_bed_allocations').delete().eq('schedule_id', args.scheduleId),
    args.supabase.from('schedule_calculations').delete().eq('schedule_id', args.scheduleId),
  ])
  const deleteError = firstResultError(deleteResults)
  if (deleteError) return { error: deleteError }

  if ((args.snapshot.pcaRows || []).length > 0) {
    const pcaRes = await args.supabase.from('schedule_pca_allocations').insert(args.snapshot.pcaRows)
    if ((pcaRes as any)?.error) return { error: (pcaRes as any).error }
  }
  if ((args.snapshot.therapistRows || []).length > 0) {
    const therapistRes = await args.supabase.from('schedule_therapist_allocations').insert(args.snapshot.therapistRows)
    if ((therapistRes as any)?.error) return { error: (therapistRes as any).error }
  }
  if ((args.snapshot.bedRows || []).length > 0) {
    const bedRes = await args.supabase.from('schedule_bed_allocations').insert(args.snapshot.bedRows)
    if ((bedRes as any)?.error) return { error: (bedRes as any).error }
  }
  if ((args.snapshot.calcRows || []).length > 0) {
    const calcRes = await args.supabase.from('schedule_calculations').insert(args.snapshot.calcRows)
    if ((calcRes as any)?.error) return { error: (calcRes as any).error }
  }

  const restoreMetaRes = await args.supabase
    .from('daily_schedules')
    .update({
      tie_break_decisions: args.snapshot.metadata.tieBreakDecisions,
      staff_overrides: args.snapshot.metadata.staffOverrides,
      workflow_state: args.snapshot.metadata.workflowState,
    })
    .eq('id', args.scheduleId)
  if ((restoreMetaRes as any)?.error) return { error: (restoreMetaRes as any).error }

  return { ok: true }
}

export async function saveScheduleFallbackAtomically(args: {
  supabase: FallbackSupabaseLike
  scheduleId: string
  rows: FallbackSaveRowsPayload
  metadata: FallbackSaveMetadataPayload
}): Promise<FallbackSaveExecutionResult<{ updatedAt: string | null }>> {
  return executeFallbackSaveWithRollback<FallbackSaveSnapshot, { updatedAt: string | null }>({
    captureSnapshot: async () => captureFallbackSaveSnapshot({ supabase: args.supabase, scheduleId: args.scheduleId }),
    writeRows: async () => writeFallbackRows({ supabase: args.supabase, scheduleId: args.scheduleId, rows: args.rows }),
    writeMetadata: async () =>
      writeFallbackMetadata({ supabase: args.supabase, scheduleId: args.scheduleId, metadata: args.metadata }),
    restoreSnapshot: async (snapshot) =>
      restoreFallbackSaveSnapshot({ supabase: args.supabase, scheduleId: args.scheduleId, snapshot }),
  })
}
