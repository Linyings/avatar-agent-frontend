/**
 * MarkdownLite — 轻量 Markdown 渲染
 *
 * Agent 回复是 Markdown（标题、列表、表格、代码、加粗），直接当纯文本显示会把
 * `| 项 | 值 |` 这类语法原样暴露给用户。这里只实现 Agent 实际会用到的子集，
 * 避免为渲染 5 种语法引入完整的 markdown 依赖链。
 *
 * 安全前提：全程不写 innerHTML，所有内容都作为 React 文本节点渲染，
 * 因此模型输出里的 HTML/脚本不会被浏览器执行。
 */
import { useMemo } from 'react'

interface MarkdownLiteProps {
  content: string
  color: string
  mutedColor: string
  borderColor: string
  codeBg: string
}

/* 行内语法：**加粗**、`代码`、*斜体* */
function renderInline(text: string, key: string, codeBg: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g
  let last = 0
  let m: RegExpExecArray | null
  let i = 0

  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index))
    const token = m[0]
    if (token.startsWith('**')) {
      nodes.push(<strong key={`${key}-b${i}`} style={{ fontWeight: 700 }}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('`')) {
      nodes.push(
        <code key={`${key}-c${i}`} style={{
          background: codeBg, borderRadius: 4, padding: '1px 4px',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.92em',
        }}>
          {token.slice(1, -1)}
        </code>,
      )
    } else {
      nodes.push(<em key={`${key}-i${i}`}>{token.slice(1, -1)}</em>)
    }
    last = m.index + token.length
    i += 1
  }
  if (last < text.length) nodes.push(text.slice(last))
  return nodes
}

/* 表格：识别连续的 | ... | 行，第二行为分隔行时渲染成 table */
function isTableRow(line: string): boolean {
  return line.trim().startsWith('|') && line.trim().endsWith('|')
}

function isTableDivider(line: string): boolean {
  const cells = line.trim().replace(/^\||\|$/g, '').split('|')
  return cells.length > 0 && cells.every(c => /^\s*:?-{2,}:?\s*$/.test(c))
}

function splitCells(line: string): string[] {
  return line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
}

export function MarkdownLite({ content, color, mutedColor, borderColor, codeBg }: MarkdownLiteProps) {
  const blocks = useMemo(() => {
    const lines = content.replace(/\r\n/g, '\n').split('\n')
    const out: React.ReactNode[] = []
    let i = 0
    let key = 0

    while (i < lines.length) {
      const line = lines[i]

      if (line.trim() === '') { i += 1; continue }

      // 表格
      if (isTableRow(line) && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
        const header = splitCells(line)
        const rows: string[][] = []
        i += 2
        while (i < lines.length && isTableRow(lines[i])) {
          rows.push(splitCells(lines[i]))
          i += 1
        }
        out.push(
          <div key={`t${key++}`} style={{ overflowX: 'auto', margin: '8px 0' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 12, minWidth: '100%' }}>
              <thead>
                <tr>
                  {header.map((h, hi) => (
                    <th key={hi} style={{
                      textAlign: 'left', padding: '5px 8px', borderBottom: `1px solid ${borderColor}`,
                      color: mutedColor, fontWeight: 600, whiteSpace: 'nowrap',
                    }}>
                      {renderInline(h, `th${key}-${hi}`, codeBg)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} style={{ padding: '5px 8px', borderBottom: `1px solid ${borderColor}`, verticalAlign: 'top' }}>
                        {renderInline(cell, `td${key}-${ri}-${ci}`, codeBg)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        )
        continue
      }

      // 标题
      const h = /^(#{1,4})\s+(.*)$/.exec(line)
      if (h) {
        const level = h[1].length
        out.push(
          <div key={`h${key++}`} style={{
            fontSize: level <= 2 ? 15 : 13.5, fontWeight: 700, margin: '10px 0 4px',
          }}>
            {renderInline(h[2], `h${key}`, codeBg)}
          </div>,
        )
        i += 1
        continue
      }

      // 代码块
      if (line.trim().startsWith('```')) {
        const buf: string[] = []
        i += 1
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          buf.push(lines[i]); i += 1
        }
        i += 1
        out.push(
          <pre key={`p${key++}`} style={{
            background: codeBg, borderRadius: 6, padding: '8px 10px', margin: '8px 0',
            overflowX: 'auto', fontSize: 12, lineHeight: 1.5,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          }}>
            <code>{buf.join('\n')}</code>
          </pre>,
        )
        continue
      }

      // 列表（有序 / 无序）
      const ul = /^[-*+]\s+(.*)$/.exec(line)
      const ol = /^(\d+)[.)]\s+(.*)$/.exec(line)
      if (ul || ol) {
        const ordered = Boolean(ol)
        const items: string[] = []
        while (i < lines.length) {
          const cur = lines[i]
          const mu = /^[-*+]\s+(.*)$/.exec(cur)
          const mo = /^(\d+)[.)]\s+(.*)$/.exec(cur)
          if (ordered && mo) { items.push(mo[2]); i += 1; continue }
          if (!ordered && mu) { items.push(mu[1]); i += 1; continue }
          // 续行（缩进的下一行并入上一条）
          if (items.length > 0 && /^\s{2,}\S/.test(cur)) {
            items[items.length - 1] += ` ${cur.trim()}`; i += 1; continue
          }
          break
        }
        const Tag = ordered ? 'ol' : 'ul'
        out.push(
          <Tag key={`l${key++}`} style={{ margin: '6px 0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {items.map((it, ii) => (
              <li key={ii} style={{ lineHeight: 1.6 }}>{renderInline(it, `li${key}-${ii}`, codeBg)}</li>
            ))}
          </Tag>,
        )
        continue
      }

      // 引用
      if (line.trim().startsWith('>')) {
        const buf: string[] = []
        while (i < lines.length && lines[i].trim().startsWith('>')) {
          buf.push(lines[i].trim().replace(/^>\s?/, '')); i += 1
        }
        out.push(
          <div key={`q${key++}`} style={{
            borderLeft: `2px solid ${borderColor}`, paddingLeft: 10, margin: '6px 0', color: mutedColor,
          }}>
            {renderInline(buf.join(' '), `q${key}`, codeBg)}
          </div>,
        )
        continue
      }

      // 分割线
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
        out.push(<div key={`hr${key++}`} style={{ height: 1, background: borderColor, margin: '10px 0' }} />)
        i += 1
        continue
      }

      // 普通段落（合并到空行为止）
      const para: string[] = []
      while (
        i < lines.length &&
        lines[i].trim() !== '' &&
        !/^(#{1,4})\s+/.test(lines[i]) &&
        !isTableRow(lines[i]) &&
        !/^[-*+]\s+/.test(lines[i]) &&
        !/^(\d+)[.)]\s+/.test(lines[i]) &&
        !lines[i].trim().startsWith('```') &&
        !lines[i].trim().startsWith('>')
      ) {
        para.push(lines[i]); i += 1
      }
      if (para.length > 0) {
        out.push(
          <p key={`pa${key++}`} style={{ margin: '5px 0', lineHeight: 1.65 }}>
            {renderInline(para.join(' '), `pa${key}`, codeBg)}
          </p>,
        )
      }
    }

    return out
  }, [content, borderColor, codeBg, mutedColor])

  return <div style={{ color, wordBreak: 'break-word' }}>{blocks}</div>
}
