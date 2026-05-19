import { buildDemoMatch } from '@/lib/matchHistoryTools';
import { findDemoMatch } from '@/lib/matchHistoryView';

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

export async function openOrCreateDemoMatch({
  allMatches,
  user,
  t,
  createMatchHistory,
  queryClient,
  setSelected,
  setShowReport,
  setCreatingDemo,
}) {
  setCreatingDemo(true);
  try {
    const existingDemo = findDemoMatch(allMatches, user?.id);
    if (existingDemo) {
      setSelected(existingDemo);
      setShowReport(true);
      return existingDemo;
    }

    const demoMatch = buildDemoMatch(user, t);
    const created = await createMatchHistory(demoMatch);
    await queryClient.invalidateQueries({ queryKey: ['matchHistory'] });
    setSelected(created);
    setShowReport(true);
    return created;
  } finally {
    setCreatingDemo(false);
  }
}

export async function seedDemoMatchIfMissing({
  allMatches,
  user,
  t,
  createMatchHistory,
  queryClient,
  setSelected,
  setShowReport,
  demoSeededRef,
}) {
  if (!user?.id || demoSeededRef.current) return null;

  const existingDemo = findDemoMatch(allMatches, user?.id);
  if (existingDemo) {
    demoSeededRef.current = true;
    setSelected(existingDemo);
    setShowReport(true);
    return existingDemo;
  }

  demoSeededRef.current = true;
  const demoMatch = buildDemoMatch(user, t);
  const created = await createMatchHistory(demoMatch);
  await queryClient.invalidateQueries({ queryKey: ['matchHistory'] });
  setSelected(created);
  setShowReport(true);
  return created;
}
