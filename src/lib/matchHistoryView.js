export function filterMatchHistoryByOwner(allMatches, { isAdmin, selectedOwner, userId }) {
  return (allMatches || []).filter((match) => {
    if (!isAdmin) return match.owner_user_id === userId;
    if (selectedOwner === 'all') return true;
    if (selectedOwner === 'mine') return match.owner_user_id === userId;
    return match.owner_user_id === selectedOwner;
  });
}

export function findDemoMatch(matches, userId, demoKeyPrefix = 'fce-bonus-demo-v1-') {
  return (matches || []).find(
    (match) => match?.owner_user_id === userId && String(match?.demo_key || '').startsWith(demoKeyPrefix),
  ) || null;
}
