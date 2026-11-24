export type Lang = 'zh' | 'en'

/** Read once at startup: the UI language follows the system. */
export const lang: Lang = navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'

const zh = {
  'app.title': '单词卡片',
  'app.loading': '加载中…',
  'deck.add': '添加',
  'deck.progress': '学习进度',
  'deck.mastered': '已掌握 {known} / {total}',
  'deck.start': '开始学习',
  'deck.all': '全部单词',
  'deck.count': '共 {n} 个',
  'status.new': '未学',
  'status.learning': '学习中',
  'status.mastered': '已掌握',
  'study.back': '返回词库',
  'study.counter': '第 {i} / {n} 张',
  'study.flip': '轻点卡片查看释义',
  'study.flipBack': '轻点卡片翻回正面',
  'study.unknown': '不认识',
  'study.known': '认识',
  'summary.title': '本轮完成',
  'summary.total': '本轮共学习 {n} 张卡片',
  'summary.known': '认识',
  'summary.learned': '学会',
  'summary.again': '再来一轮',
  'summary.deck': '返回词库',
  'add.title': '添加单词',
  'add.back': '返回词库',
  'add.word': '单词',
  'add.wordHint': '例如 explore',
  'add.meaning': '释义',
  'add.meaningHint': '这个单词的意思',
  'add.example': '例句（选填）',
  'add.exampleHint': '用一个句子记住它',
  'add.duplicate': '这个词已经在词库中了',
  'add.save': '保存',
  'delete.word': '删除 {word}',
  'delete.ask': '删除这个单词？',
  'delete.cancel': '取消',
  'delete.confirm': '删除',
  'toast.added': '已添加「{word}」',
  'toast.deleted': '已删除「{word}」',
}

/** `typeof zh` keeps both languages on the same set of keys. */
const en: typeof zh = {
  'app.title': 'Word cards',
  'app.loading': 'Loading…',
  'deck.add': 'Add',
  'deck.progress': 'Your progress',
  'deck.mastered': '{known} / {total} mastered',
  'deck.start': 'Start studying',
  'deck.all': 'All words',
  'deck.count': '{n} in all',
  'status.new': 'New',
  'status.learning': 'Learning',
  'status.mastered': 'Mastered',
  'study.back': 'Back to deck',
  'study.counter': 'Card {i} of {n}',
  'study.flip': 'Tap the card to see the meaning',
  'study.flipBack': 'Tap to flip back',
  'study.unknown': 'Still learning',
  'study.known': 'I know it',
  'summary.title': 'Round complete',
  'summary.total': '{n} cards studied this round',
  'summary.known': 'Known',
  'summary.learned': 'Learned',
  'summary.again': 'Study again',
  'summary.deck': 'Back to deck',
  'add.title': 'Add word',
  'add.back': 'Back to deck',
  'add.word': 'Word',
  'add.wordHint': 'e.g. explore',
  'add.meaning': 'Meaning',
  'add.meaningHint': 'What the word means',
  'add.example': 'Example (optional)',
  'add.exampleHint': 'A sentence that uses it',
  'add.duplicate': 'This word is already in your deck',
  'add.save': 'Save',
  'delete.word': 'Delete {word}',
  'delete.ask': 'Delete this word?',
  'delete.cancel': 'Cancel',
  'delete.confirm': 'Delete',
  'toast.added': 'Added “{word}”',
  'toast.deleted': 'Deleted “{word}”',
}

const strings = { zh, en }

type Key = keyof typeof zh

/** Looks a string up in the UI language; each `{name}` placeholder takes its value from `values`. */
export function t(key: Key, values: Record<string, string | number> = {}): string {
  return strings[lang][key].replace(/\{(\w+)\}/g, (placeholder, name: string) => String(values[name] ?? placeholder))
}
