/** UI language follows the system; every user-visible string lives here in both languages. */
export const isZh = (navigator.language ?? 'en').toLowerCase().startsWith('zh')
export const locale = isZh ? 'zh-CN' : 'en'

const dict = {
  summaryLabel: ['本月概览', 'This month overview'],
  monthLabel: ['月份', 'Month'],
  title: ['轻记账', 'Ledger'],
  prevMonth: ['上个月', 'Previous month'],
  nextMonth: ['下个月', 'Next month'],
  thisMonth: ['回到本月', 'This month'],
  typeLabel: ['类型', 'Entry type'],
  expense: ['支出', 'Expense'],
  income: ['收入', 'Income'],
  balance: ['结余', 'Balance'],
  amountLabel: ['金额', 'Amount'],
  amountError: ['金额需大于 0，最多两位小数', 'Enter an amount above 0, with at most 2 decimals'],
  categoryLabel: ['分类', 'Category'],
  noteLabel: ['备注', 'Note'],
  notePlaceholder: ['备注（可选）', 'Note (optional)'],
  save: ['记一笔', 'Add entry'],
  saveFailed: ['更改未能保存到本设备', "Couldn't save changes on this device"],
  retry: ['重试', 'Retry'],
  breakdownTitle: ['支出分类', 'Spending by category'],
  breakdownEmpty: ['本月还没有支出', 'No spending this month yet'],
  entriesTitle: ['明细', 'Entries'],
  entriesEmpty: ['本月还没有记录', 'No entries this month'],
  entriesEmptyHint: ['用上方的表单记下第一笔', 'Add your first one with the form above'],
  delete: ['删除', 'Delete'],
  confirmDeleteQuestion: ['删除这笔记录？', 'Delete this entry?'],
  cancel: ['取消', 'Cancel'],
  confirmDelete: ['删除', 'Delete'],
} as const satisfies Record<string, readonly [string, string]>

export const t = (key: keyof typeof dict) => dict[key][isZh ? 0 : 1]
