/** UI language and every user-visible string, with both languages kept in lockstep. */

export type Lang = 'zh' | 'en'

export const detectLanguage = (): Lang => (navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en')

const zh = {
  title: '喝水',
  today: '今日饮水',
  progressAria: '今日饮水进度',
  remaining: '还差 {ml} ml',
  over: '已超出 {ml} ml',
  goalReached: '达标',
  addCup: '喝了一杯',
  half: '半杯',
  oneCup: '一杯',
  bottle: '一瓶',
  goalTitle: '每日目标',
  goalAria: '每日目标 {ml} ml',
  entriesTitle: '今日记录',
  emptyTitle: '今天还没喝水',
  emptyHint: '点上面的按钮，记录第一杯',
  deleteAria: '删除 {time} 的记录',
  deletePrompt: '删除这条记录？',
  confirmDelete: '确认删除',
  cancelDelete: '取消',
  historyTitle: '近 7 天',
  chartAria: '近 7 天每日饮水量，目标 {goal} ml',
  goalLabel: '目标 {goal}',
  weekTotal: '近 7 天共 {ml} ml',
  streak: '连续 {n} 天达标',
  noStreak: '还没有连续达标',
  loading: '正在加载…',
}

/** The shape every language must provide. */
export type Copy = typeof zh

const en: Copy = {
  title: 'Water',
  today: 'Today',
  progressAria: "Today's water progress",
  remaining: '{ml} ml to go',
  over: '{ml} ml over',
  goalReached: 'Goal reached',
  addCup: 'Logged a cup',
  half: 'Half',
  oneCup: 'Cup',
  bottle: 'Bottle',
  goalTitle: 'Daily goal',
  goalAria: 'Daily goal {ml} ml',
  entriesTitle: "Today's log",
  emptyTitle: 'Nothing logged today',
  emptyHint: 'Log your first cup with the buttons above',
  deleteAria: 'Delete the {time} entry',
  deletePrompt: 'Delete this entry?',
  confirmDelete: 'Confirm delete',
  cancelDelete: 'Cancel',
  historyTitle: 'Last 7 days',
  chartAria: 'Daily water for the last 7 days, goal {goal} ml',
  goalLabel: 'Goal {goal}',
  weekTotal: '{ml} ml in the last 7 days',
  streak: '{n}-day streak',
  noStreak: 'No streak yet',
  loading: 'Loading…',
}

export const STRINGS: Record<Lang, Copy> = { zh, en }

export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_match, key: string) => String(values[key] ?? ''))
}
