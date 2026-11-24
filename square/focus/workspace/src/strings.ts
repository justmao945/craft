/** UI language and every user-visible string: Simplified Chinese for zh* system locales, English otherwise. */

export type Lang = 'zh' | 'en'

export const detectLanguage = (): Lang => (navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en')

const dict = {
  title: { zh: '专注', en: 'Focus' },
  modeLabel: { zh: '计时模式', en: 'Timer mode' },
  focus: { zh: '专注', en: 'Focus' },
  break: { zh: '休息', en: 'Break' },
  today: { zh: '今日 {sessions} · {minutes} 分钟', en: 'Today: {sessions} · {minutes} min' },
  sessionOne: { zh: '{n} 次专注', en: '{n} session' },
  sessionMany: { zh: '{n} 次专注', en: '{n} sessions' },
  readyFocus: { zh: '准备专注', en: 'Ready to focus' },
  readyBreak: { zh: '准备休息', en: 'Ready for a break' },
  focusing: { zh: '专注中', en: 'Focusing' },
  breaking: { zh: '休息中', en: 'On a break' },
  paused: { zh: '已暂停', en: 'Paused' },
  confirmHint: { zh: '再点一次「确认重置」放弃本次计时', en: 'Tap “Confirm reset” to discard this session' },
  start: { zh: '开始', en: 'Start' },
  pause: { zh: '暂停', en: 'Pause' },
  resume: { zh: '继续', en: 'Resume' },
  startBreak: { zh: '开始休息', en: 'Start break' },
  startFocus: { zh: '开始专注', en: 'Start focus' },
  reset: { zh: '重置', en: 'Reset' },
  confirmReset: { zh: '确认重置', en: 'Confirm reset' },
  skip: { zh: '跳过', en: 'Skip' },
  later: { zh: '稍后', en: 'Later' },
  focusLength: { zh: '专注时长（分钟）', en: 'Focus length (min)' },
  nextFocus: { zh: '下次专注时长（分钟）', en: 'Next focus (min)' },
  focusDone: { zh: '专注完成！', en: 'Focus complete!' },
  focusDoneBody: { zh: '完成 {minutes} 分钟专注，休息一下', en: '{minutes} min done. Time for a break.' },
  breakDone: { zh: '休息结束', en: 'Break’s over' },
  breakDoneBody: { zh: '缓过来了？开始下一轮专注', en: 'Recharged? Time to focus.' },
  stats: { zh: '近 7 天', en: 'Last 7 days' },
  streak: { zh: '连续 {n} 天', en: '{n}-day streak' },
  statsTotal: { zh: '{sessions} · 共 {minutes} 分钟', en: '{sessions} · {minutes} min' },
  statsEmpty: { zh: '还没有记录，完成一次专注就会出现在这里', en: 'No sessions yet. Finish a focus to see it here.' },
  chartLabel: { zh: '近 7 天每日专注分钟数', en: 'Focus minutes per day' },
} satisfies Record<string, Record<Lang, string>>

export type Key = keyof typeof dict

/** Looks a string up in the UI language and fills `{name}` placeholders. */
export function t(lang: Lang, key: Key, vars: Record<string, string | number> = {}): string {
  return dict[key][lang].replace(/\{(\w+)\}/g, (_match, name: string) => String(vars[name]))
}

/** Weekday names from Monday; `short` labels the chart axis. */
export const WEEKDAYS: Record<Lang, { short: string[]; long: string[] }> = {
  zh: { short: ['一', '二', '三', '四', '五', '六', '日'], long: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] },
  en: { short: ['M', 'T', 'W', 'T', 'F', 'S', 'S'], long: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
}
