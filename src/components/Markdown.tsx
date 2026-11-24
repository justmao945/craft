import { memo } from 'react'
import type { MouseEvent, ReactNode } from 'react'
import { Browser } from '@capacitor/browser'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/** Links open in the browser over Craft; navigating the WebView away would close the app UI. */
function Link({ href, children }: { href?: string; children?: ReactNode }) {
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    if (href) void Browser.open({ url: href }).catch(() => {})
  }
  return <a href={href} onClick={open}>{children}</a>
}

/** Markdown body of one message; memoized because a long conversation re-renders on every new message. */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return <div className="markdown">
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: Link }}>{text}</ReactMarkdown>
  </div>
})
