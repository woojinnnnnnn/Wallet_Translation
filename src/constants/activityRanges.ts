import type { ActivityRange } from '../types/activity';

export const activityRanges: Array<{ label: string; value: ActivityRange }> = [
  { label: 'Latest 12', value: 'latest' },
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
];
