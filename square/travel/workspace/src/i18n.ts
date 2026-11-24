import { parseDay } from './model'

/** UI language, read once at startup: Simplified Chinese for zh* system locales, English otherwise. */
const isZh = navigator.language.toLowerCase().startsWith('zh')
document.documentElement.lang = isZh ? 'zh-CN' : 'en'

const zh = {
  appName: '旅行手帐',
  newTrip: '新建旅程',
  loading: '正在翻开手帐…',
  emptyTitle: '还没有旅程',
  emptyHint: '点「新建旅程」，为下一段出发准备一本手帐。',
  ongoing: (day: number) => `进行中 · 第 ${day} 天`,
  upcoming: (days: number) => (days === 1 ? '明天出发' : `${days} 天后出发`),
  lasted: (days: number) => `共 ${days} 天`,
  entryCount: (count: number) => `${count} 篇手记`,
  openEnded: (date: string) => `${date} 出发`,
  formTitle: '新建旅程',
  titleLabel: '标题',
  titlePlaceholder: '给旅程起个名字',
  titleRequired: '请填写标题',
  destinationLabel: '目的地',
  destinationPlaceholder: '城市或国家（选填）',
  startLabel: '出发日期',
  startRequired: '请选择出发日期',
  endLabel: '结束日期（选填）',
  endBeforeStart: '结束日期不能早于出发日期',
  save: '保存',
  cancel: '取消',
  back: '返回',
  entries: '手记',
  day: (day: number) => `第 ${day} 天`,
  noEntriesTitle: '还没有手记',
  noEntriesHint: '在下方写下旅途的第一笔。',
  writeEntry: '写手记',
  placeLabel: '地点',
  placePlaceholder: '在哪里？（选填）',
  moodLabel: '心情',
  textLabel: '手记内容',
  textPlaceholder: '记下此刻的见闻与心情…',
  add: '添加',
  deleteEntry: '删除手记',
  confirmDelete: '删除这篇手记？',
  delete: '删除',
}

/** Every user-visible string exists in both languages. */
const en: typeof zh = {
  appName: 'Travel journal',
  newTrip: 'New trip',
  loading: 'Opening your journal…',
  emptyTitle: 'No trips yet',
  emptyHint: 'Tap "New trip" to open a journal for your next journey.',
  ongoing: (day) => `Ongoing · Day ${day}`,
  upcoming: (days) => (days === 1 ? 'Tomorrow' : `In ${days} days`),
  lasted: (days) => `${days} ${days === 1 ? 'day' : 'days'}`,
  entryCount: (count) => `${count} ${count === 1 ? 'entry' : 'entries'}`,
  openEnded: (date) => `From ${date}`,
  formTitle: 'New trip',
  titleLabel: 'Title',
  titlePlaceholder: 'Name your trip',
  titleRequired: 'Please enter a title',
  destinationLabel: 'Destination',
  destinationPlaceholder: 'City or country (optional)',
  startLabel: 'Start date',
  startRequired: 'Choose a start date',
  endLabel: 'End date (optional)',
  endBeforeStart: "End date can't be before the start date",
  save: 'Save',
  cancel: 'Cancel',
  back: 'Back',
  entries: 'Entries',
  day: (day) => `Day ${day}`,
  noEntriesTitle: 'No entries yet',
  noEntriesHint: 'Write your first note below.',
  writeEntry: 'Write an entry',
  placeLabel: 'Place',
  placePlaceholder: 'Where are you? (optional)',
  moodLabel: 'Mood',
  textLabel: 'Note',
  textPlaceholder: 'What did you see, feel, taste…',
  add: 'Add',
  deleteEntry: 'Delete entry',
  confirmDelete: 'Delete this entry?',
  delete: 'Delete',
}

export const t = isZh ? zh : en

/* ---------- calendar names ---------- */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const ZH_WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** A calendar day for people: "11月20日" / "Nov 20"; the year is added when it is not the current one. */
export function dayLabel(day: string, forceYear = false): string {
  const [year, month, date] = day.split('-').map(Number)
  const withYear = forceYear || year !== new Date().getFullYear()
  if (isZh) return withYear ? `${year}年${month}月${date}日` : `${month}月${date}日`
  return `${MONTHS[month - 1]} ${date}${withYear ? `, ${year}` : ''}`
}

/** "11月20日 – 11月25日" / "Nov 20 – Nov 25"; open trips read "11月20日 出发" / "From Nov 20". */
export function rangeLabel(start: string, end: string | null): string {
  if (end === null) return t.openEnded(dayLabel(start))
  if (start === end) return dayLabel(start)
  const crossesYear = start.slice(0, 4) !== end.slice(0, 4)
  return `${dayLabel(start, crossesYear)} – ${dayLabel(end, crossesYear)}`
}

export const weekday = (day: string) => (isZh ? ZH_WEEKDAYS : WEEKDAYS)[parseDay(day).getDay()]

/* ---------- moods ---------- */

/** The fixed mood set: the emoji is the stored value, the name is its accessible label. */
export const MOODS = [
  { emoji: '🤩', zh: '兴奋', en: 'Thrilled' },
  { emoji: '😍', zh: '心动', en: 'Amazed' },
  { emoji: '😌', zh: '惬意', en: 'Relaxed' },
  { emoji: '🥺', zh: '感动', en: 'Touched' },
  { emoji: '😩', zh: '疲惫', en: 'Tired' },
  { emoji: '😔', zh: '想家', en: 'Homesick' },
]

export const moodName = (mood: (typeof MOODS)[number]) => (isZh ? mood.zh : mood.en)
