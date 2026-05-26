export async function deleteSingleMatchHistory({ id, deleteMatchHistory, queryClient }) {
  await deleteMatchHistory(id);
  await queryClient.invalidateQueries({ queryKey: ['matchHistory'] });
}

export async function deleteSelectedMatchHistory({
  selectedIds,
  deleteManyMatchHistory,
  queryClient,
  setSelectedIds,
  setSelectionMode,
  setDeleting,
}) {
  setDeleting(true);
  try {
    await deleteManyMatchHistory([...selectedIds]);
    setSelectedIds(new Set());
    setSelectionMode(false);
    await queryClient.invalidateQueries({ queryKey: ['matchHistory'] });
  } finally {
    setDeleting(false);
  }
}
