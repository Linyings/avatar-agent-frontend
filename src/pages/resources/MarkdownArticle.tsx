import { Anchor, Box, Code, List, Paper, Stack, Table, Text, Title } from '@mantine/core'

interface FigureBlock {
  alt: string
  caption: string
  height?: string
  imgSrc: string
  sourceSrcSet?: string
  width?: string
}

export default function MarkdownArticle({ markdown }: { markdown: string }) {
  const body = stripFrontmatter(markdown)
  const lines = body.split('\n')
  const blocks = parseBlocks(lines)

  return (
    <Stack component="article" gap="xl">
      {blocks.map((block, index) => renderBlock(block, index))}
    </Stack>
  )
}

type MarkdownBlock =
  | { type: 'blockquote'; text: string }
  | { type: 'figure'; html: string }
  | { type: 'heading'; depth: 2 | 3 | 4; text: string }
  | { type: 'orderedList'; items: string[] }
  | { type: 'paragraph'; text: string }
  | { type: 'table'; rows: string[][] }
  | { type: 'unorderedList'; items: string[] }

function stripFrontmatter(markdown: string) {
  return markdown.replace(/^---[\s\S]*?---\s*/, '').trim()
}

function parseBlocks(lines: string[]) {
  const blocks: MarkdownBlock[] = []
  let index = 0
  let skippedFirstHeading = false

  while (index < lines.length) {
    const line = lines[index]?.trimEnd() ?? ''

    if (!line.trim()) {
      index += 1
      continue
    }

    if (!skippedFirstHeading && line.startsWith('# ')) {
      skippedFirstHeading = true
      index += 1
      continue
    }

    if (line.trimStart().startsWith('<figure')) {
      const figureLines = [line]
      index += 1
      while (index < lines.length && !lines[index].includes('</figure>')) {
        figureLines.push(lines[index])
        index += 1
      }
      if (index < lines.length) {
        figureLines.push(lines[index])
        index += 1
      }
      blocks.push({ type: 'figure', html: figureLines.join('\n') })
      continue
    }

    const headingMatch = /^(#{2,4})\s+(.+)$/.exec(line)
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        depth: headingMatch[1].length as 2 | 3 | 4,
        text: headingMatch[2],
      })
      index += 1
      continue
    }

    if (isTableStart(lines, index)) {
      const tableLines = [line]
      index += 1
      while (index < lines.length && lines[index].trim().startsWith('|')) {
        tableLines.push(lines[index].trimEnd())
        index += 1
      }
      blocks.push({ type: 'table', rows: parseTableRows(tableLines) })
      continue
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = []
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ''))
        index += 1
      }
      blocks.push({ type: 'orderedList', items })
      continue
    }

    if (/^-\s+/.test(line.trim())) {
      const items: string[] = []
      while (index < lines.length && /^-\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^-\s+/, ''))
        index += 1
      }
      blocks.push({ type: 'unorderedList', items })
      continue
    }

    if (line.trim().startsWith('> ')) {
      blocks.push({ type: 'blockquote', text: line.trim().replace(/^>\s+/, '') })
      index += 1
      continue
    }

    const paragraphLines = [line.trim()]
    index += 1
    while (index < lines.length && !startsNewBlock(lines, index)) {
      paragraphLines.push(lines[index].trim())
      index += 1
    }
    blocks.push({ type: 'paragraph', text: paragraphLines.join(' ').trim() })
  }

  return blocks
}

function startsNewBlock(lines: string[], index: number) {
  const line = lines[index]?.trim() ?? ''
  if (!line) return true

  return (
    line.startsWith('## ') ||
    line.startsWith('### ') ||
    line.startsWith('#### ') ||
    line.startsWith('<figure') ||
    line.startsWith('|') ||
    line.startsWith('> ') ||
    /^-\s+/.test(line) ||
    /^\d+\.\s+/.test(line)
  )
}

function isTableStart(lines: string[], index: number) {
  const current = lines[index]?.trim() ?? ''
  const next = lines[index + 1]?.trim() ?? ''

  return current.startsWith('|') && /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(next)
}

function parseTableRows(tableLines: string[]) {
  return tableLines
    .filter((_, index) => index !== 1)
    .map((line) =>
      line
        .trim()
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.trim()),
    )
}

function renderBlock(block: MarkdownBlock, index: number) {
  if (block.type === 'heading') {
    return (
      <Title
        key={index}
        order={block.depth}
        fz={block.depth === 2 ? { base: 28, md: 36 } : { base: 22, md: 26 }}
        lh={1.2}
        mt={block.depth === 2 ? 'xl' : 'sm'}
      >
        {renderInline(block.text)}
      </Title>
    )
  }

  if (block.type === 'paragraph') {
    return (
      <Text key={index} fz="lg" lh={1.85} c="#344054">
        {renderInline(block.text)}
      </Text>
    )
  }

  if (block.type === 'blockquote') {
    return (
      <Paper
        key={index}
        component="blockquote"
        p="lg"
        radius={8}
        bg="#f1f8f4"
        withBorder
        m={0}
        style={{ borderColor: '#d8eadf', boxShadow: 'none' }}
      >
        <Text fz="lg" lh={1.8} fw={700} c="green.9">
          {renderInline(block.text)}
        </Text>
      </Paper>
    )
  }

  if (block.type === 'orderedList' || block.type === 'unorderedList') {
    return (
      <List
        key={index}
        component={block.type === 'orderedList' ? 'ol' : 'ul'}
        spacing="sm"
        size="lg"
        c="#344054"
        styles={{ itemWrapper: { lineHeight: 1.75 } }}
      >
        {block.items.map((item) => (
          <List.Item key={item}>{renderInline(item)}</List.Item>
        ))}
      </List>
    )
  }

  if (block.type === 'table') {
    const [header = [], ...rows] = block.rows

    return (
      <Paper
        key={index}
        radius={8}
        withBorder
        bg="#ffffff"
        style={{ borderColor: '#e4eaf2', boxShadow: 'none', overflowX: 'auto' }}
      >
        <Table
          verticalSpacing="md"
          horizontalSpacing="lg"
          styles={{
            table: { background: '#ffffff' },
            th: { background: '#eef5ff', color: '#102033', fontWeight: 800 },
            td: { background: '#ffffff', borderColor: '#e4eaf2', color: '#102033' },
            tr: { borderColor: '#e4eaf2' },
          }}
        >
          <Table.Thead>
            <Table.Tr>
              {header.map((cell) => (
                <Table.Th key={cell}>{renderInline(cell)}</Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {rows.map((row, rowIndex) => (
              <Table.Tr key={`${row.join('|')}-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <Table.Td key={`${cell}-${cellIndex}`}>{renderInline(cell)}</Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
    )
  }

  return <ArticleFigure key={index} figure={parseFigure(block.html)} />
}

function ArticleFigure({ figure }: { figure: FigureBlock }) {
  return (
    <Box component="figure" m={0}>
      <picture>
        {figure.sourceSrcSet ? <source srcSet={figure.sourceSrcSet} type="image/webp" /> : null}
        <Box
          component="img"
          src={figure.imgSrc}
          alt={figure.alt}
          width={figure.width}
          height={figure.height}
          loading="eager"
          style={{ borderRadius: 8, display: 'block', height: 'auto', width: '100%' }}
        />
      </picture>
      {figure.caption ? (
        <Text component="figcaption" mt="sm" size="sm" ta="center" c="#667085" lh={1.6}>
          {figure.caption}
        </Text>
      ) : null}
    </Box>
  )
}

function parseFigure(html: string): FigureBlock {
  return {
    alt: readAttribute(html, 'alt'),
    caption: /<figcaption>([\s\S]*?)<\/figcaption>/.exec(html)?.[1]?.trim() ?? '',
    height: readAttribute(html, 'height'),
    imgSrc: readAttribute(html, 'src'),
    sourceSrcSet: readAttribute(html, 'srcset'),
    width: readAttribute(html, 'width'),
  }
}

function readAttribute(html: string, attribute: string) {
  return new RegExp(`${attribute}="([^"]*)"`).exec(html)?.[1] ?? ''
}

function renderInline(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g)

  return parts.map((part, index) => {
    if (!part) return null

    const boldMatch = /^\*\*([^*]+)\*\*$/.exec(part)
    if (boldMatch) return <strong key={index}>{boldMatch[1]}</strong>

    const codeMatch = /^`([^`]+)`$/.exec(part)
    if (codeMatch) return <Code key={index}>{codeMatch[1]}</Code>

    const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part)
    if (linkMatch) {
      return (
        <Anchor key={index} href={linkMatch[2]} target="_blank" rel="noreferrer">
          {linkMatch[1]}
        </Anchor>
      )
    }

    return part
  })
}
