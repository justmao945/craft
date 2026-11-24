/** UI language, every user-visible string, and the localized date labels. */

export type Lang = 'zh' | 'en'

export const detectLanguage = (): Lang => (navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en')

const dict = {
  title: { zh: '习惯打卡', en: 'Habit tracker' },
  today: { zh: '今天 {done}/{total}', en: '{done} of {total} today' },
  progress: { zh: '今日完成情况', en: 'Today’s progress' },
  streak: { zh: '连续 {n} 天', en: '{n}-day streak' },
  week: { zh: '本周 {n}/7', en: 'This week {n}/7' },
  strip: { zh: '近 7 天打卡情况', en: 'Last 7 days' },
  dayDone: { zh: '{day} 已完成', en: '{day}: done' },
  dayMissed: { zh: '{day} 未完成', en: '{day}: missed' },
  dayOpen: { zh: '{day} 待完成', en: '{day}: to do' },
  markDone: { zh: '将「{name}」标记为今天已完成', en: 'Mark “{name}” done today' },
  markOpen: { zh: '将「{name}」标记为今天未完成', en: 'Mark “{name}” not done today' },
  deleteHabit: { zh: '删除习惯「{name}」', en: 'Delete habit “{name}”' },
  confirmDelete: { zh: '删除「{name}」？', en: 'Delete “{name}”?' },
  cancel: { zh: '取消', en: 'Cancel' },
  confirm: { zh: '确认删除', en: 'Delete' },
  nameLabel: { zh: '新习惯名称', en: 'New habit name' },
  placeholder: { zh: '例如：阅读 20 分钟', en: 'e.g. Read 20 minutes' },
  add: { zh: '添加', en: 'Add' },
  duplicate: { zh: '已经有同名习惯了', en: 'That habit already exists' },
  emptyTitle: { zh: '还没有习惯', en: 'No habits yet' },
  emptyHint: { zh: '在上方输入名称，添加第一个习惯', en: 'Add your first habit above.' },
  loading: { zh: '加载中…', en: 'Loading…' },
} satisfies Record<string, Record<Lang, string>>

export type Key = keyof typeof dict

/** Looks a string up in the UI language and fills `{name}` placeholders. */
export function t(lang: Lang, key: Key, vars: Record<string, string | number> = {}): string {
  return dict[key][lang].replace(/\{(\w+)\}/g, (_match, name: string) => String(vars[name]))
}

/** Monday-first weekday names and single-letter strip labels. */
export const WEEKDAYS: Record<Lang, string[]> = {
  zh: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'],
  en: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
}

export const WEEKDAY_INITIALS: Record<Lang, string[]> = {
  zh: ['一', '二', '三', '四', '五', '六', '日'],
  en: ['M', 'T', 'W', 'T', 'F', 'S', 'S'],
}

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** `11月25日 · 周三` / `Wed, Nov 25`. */
export function formatDate(lang: Lang, date: Date): string {
  const weekday = WEEKDAYS[lang][(date.getDay() + 6) % 7]
  return lang === 'zh'
    ? `${date.getMonth() + 1}月${date.getDate()}日 · ${weekday}`
    : `${weekday}, ${MONTHS_EN[date.getMonth()]} ${date.getDate()}`
}
