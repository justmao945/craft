import { Capacitor } from '@capacitor/core'
import { compileProject } from './compiler/compiler'
import { projectStore, runtime } from './native/craft'
import type { AppDescriptor } from './types'

const mainTsx = `import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { storage } from '@craft/sdk'
import { TodoList, type Todo } from './components/TodoList'
import './styles.css'

function App() {
  const [todos, setTodos] = useState<Todo[]>([])
  const [text, setText] = useState('')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    storage.get<Todo[]>('todos', []).then((saved) => {
      setTodos(saved)
      setLoaded(true)
    })
  }, [])

  useEffect(() => {
    if (loaded) void storage.set('todos', todos)
  }, [todos, loaded])

  const add = () => {
    if (!text.trim()) return
    setTodos([...todos, { id: crypto.randomUUID(), text: text.trim(), done: false }])
    setText('')
  }

  return <main>
    <p className="eyebrow">CRAFT OFFLINE CHECK</p>
    <h1>今日待办</h1>
    <p className="summary">{todos.filter((todo) => !todo.done).length} 项未完成</p>
    <div className="composer">
      <input aria-label="任务内容" data-testid="todo-input" value={text}
        onChange={(event) => setText(event.target.value)} placeholder="要做点什么？" />
      <button data-testid="add-todo" onClick={add}>添加</button>
    </div>
    <TodoList todos={todos} onChange={setTodos} />
  </main>
}

createRoot(document.getElementById('root')!).render(<App />)
`

const todoListTsx = `export type Todo = { id: string; text: string; done: boolean }

export function TodoList({ todos, onChange }: { todos: Todo[]; onChange: (todos: Todo[]) => void }) {
  return <section className="list">
    {todos.length === 0 && <p className="empty">从一个小目标开始。</p>}
    {todos.map((todo) => <div className="todo" key={todo.id}>
      <button className={todo.done ? 'check done' : 'check'} aria-label={\`完成 \${todo.text}\`}
        onClick={() => onChange(todos.map((item) => item.id === todo.id ? { ...item, done: !item.done } : item))}>
        {todo.done ? '✓' : ''}
      </button>
      <span className={todo.done ? 'done-text' : ''}>{todo.text}</span>
      <button className="delete" aria-label={\`删除 \${todo.text}\`}
        onClick={() => onChange(todos.filter((item) => item.id !== todo.id))}>×</button>
    </div>)}
  </section>
}
`

const styles = `:root { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color: #19251f; background: #f2f4ee; }
* { box-sizing: border-box; }
body { margin: 0; }
main { max-width: 560px; margin: 0 auto; padding: 52px 22px; }
.eyebrow { color: #197054; font-size: 11px; font-weight: 800; letter-spacing: .14em; }
h1 { margin: 8px 0 0; font-size: 38px; letter-spacing: -.05em; }
.summary { color: #748078; margin-bottom: 28px; }
.composer { display: flex; gap: 10px; }
input { min-width: 0; flex: 1; border: 1px solid #dce2db; border-radius: 14px; background: white; padding: 14px; font-size: 16px; }
button { border: 0; border-radius: 14px; background: #197054; color: white; padding: 0 20px; font-size: 16px; font-weight: 700; }
.list { margin-top: 24px; }
.todo { display: flex; align-items: center; gap: 12px; margin-bottom: 10px; border-radius: 16px; background: white; padding: 14px; }
.todo span { flex: 1; }
.check { width: 30px; height: 30px; padding: 0; border: 1px solid #c8d1ca; border-radius: 50%; background: transparent; color: white; }
.check.done { border-color: #197054; background: #197054; }
.delete { background: transparent; color: #9ca59f; padding: 4px; font-size: 24px; }
.done-text { color: #9ca59f; text-decoration: line-through; }
.empty { color: #929b95; text-align: center; padding: 30px; }
`

async function validateTodoPreview(): Promise<void> {
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    try {
      const inspection = await runtime.inspect()
      if (inspection.tree.includes('todo-input')) {
        await runtime.input({ testId: 'todo-input', value: 'Craft self-test' })
        await runtime.click({ testId: 'add-todo' })
        const after = await runtime.inspect()
        if (!after.tree.includes('Craft self-test')) throw new Error('Todo did not appear after agent-style input/click')
        if (Capacitor.isNativePlatform()) {
          const screenshot = await runtime.screenshot()
          if (!screenshot.startsWith('data:image/png;base64,') || screenshot.length < 10_000) {
            throw new Error('Native preview screenshot is empty')
          }
        }
        const errors = (await runtime.logs()).filter((line) => line.toLowerCase().includes('error'))
        if (errors.length) throw new Error(errors.join('\n'))
        return
      }
    } catch (error) {
      if (Date.now() >= deadline) throw error
    }
    const { promise, resolve } = Promise.withResolvers<void>()
    setTimeout(resolve, 120)
    await promise
  }
  throw new Error('Todo preview did not become ready')
}

export async function createOfflineTodo(): Promise<AppDescriptor> {
  const count = (await projectStore.listApps()).filter((app) => app.name.startsWith('Todo 验证')).length + 1
  const app = await projectStore.createApp(`Todo 验证 ${count}`)
  const files = {
    'app.json': JSON.stringify({ id: app.id, name: app.name, runtimeVersion: 1, entry: 'src/main.tsx', permissions: ['storage'] }, null, 2),
    'src/main.tsx': mainTsx,
    'src/components/TodoList.tsx': todoListTsx,
    'src/styles.css': styles,
  }
  for (const [path, content] of Object.entries(files)) await projectStore.writeFile(app.id, path, content)
  const result = await compileProject(files)
  if (result.diagnostics.length || !result.js) throw new Error(result.diagnostics.join('\n') || 'Empty offline build')
  await projectStore.saveBuild(app.id, undefined, result.js, result.css, true)
  await runtime.openDraft(app.id, app.name)
  await validateTodoPreview()
  const snapshot = await projectStore.createSnapshot(app.id, 'Initial offline validation')
  await projectStore.saveBuild(app.id, snapshot.id, result.js, result.css, false)
  await projectStore.publish(app.id, snapshot.id)
  return app
}
