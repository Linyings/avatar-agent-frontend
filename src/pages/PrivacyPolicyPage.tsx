import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Anchor,
  Box,
  Button,
  Container,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { ArrowLeft, Shield } from '@/shared/icons/tabler'
import BrandLogo from '@/shared/components/brand/BrandLogo'
import BrandWordmark from '@/shared/components/brand/BrandWordmark'
import LanguageSwitcher from '@/shared/components/i18n/LanguageSwitcher'
import Footer from '@/shared/components/layout/Footer'
import { useI18n } from '@/shared/i18n/I18nProvider'

const labelStyle = { letterSpacing: '0.14em' } as const
const legalArticleStyles = `
  article[data-legal-content] h1,
  article[data-legal-content] h2,
  article[data-legal-content] h3,
  article[data-legal-content] h4 {
    color: var(--mantine-color-text);
    font-weight: 600;
    line-height: 1.3;
  }

  article[data-legal-content] h1 {
    margin: 2rem 0 1rem;
    font-size: clamp(1.75rem, 4vw, 2rem);
  }

  article[data-legal-content] h2 {
    margin: 1.5rem 0 0.875rem;
    font-size: 1.5rem;
  }

  article[data-legal-content] h3 {
    margin: 1.25rem 0 0.75rem;
    font-size: 1.25rem;
  }

  article[data-legal-content] h4 {
    margin: 1rem 0 0.625rem;
    font-size: 1.05rem;
  }

  article[data-legal-content] p,
  article[data-legal-content] li {
    color: var(--mantine-color-dimmed);
    line-height: 1.85;
  }

  article[data-legal-content] p {
    margin: 0 0 1rem;
  }

  article[data-legal-content] ul,
  article[data-legal-content] ol {
    margin: 0 0 1rem 1.25rem;
    padding: 0;
  }

  article[data-legal-content] li {
    margin-bottom: 0.5rem;
  }

  article[data-legal-content] a {
    color: var(--app-brand-accent);
    text-decoration: none;
  }

  article[data-legal-content] a:hover {
    text-decoration: underline;
  }

  article[data-legal-content] table {
    width: 100%;
    margin: 1.25rem 0;
    border-collapse: collapse;
  }

  article[data-legal-content] td,
  article[data-legal-content] th {
    padding: 0.75rem 1rem;
    border: 1px solid var(--app-border);
    color: var(--mantine-color-dimmed);
    font-size: 0.95rem;
  }

  article[data-legal-content] hr {
    margin: 2rem 0;
    border: 0;
    border-top: 1px solid var(--app-border);
  }
`

export default function PrivacyPolicyPage() {
  const { locale } = useI18n()
  const [content, setContent] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const policyPath = locale === 'en' ? '/PRIVACY_POLICY.en.md' : '/PRIVACY_POLICY.md'
    fetch(policyPath)
      .then(response => response.text())
      .then(text => {
        setContent(text)
        setLoading(false)
      })
      .catch(error => {
        console.error('加载隐私政策失败:', error)
        setLoading(false)
      })
  }, [locale])

  return (
    <Box style={{ minHeight: '100vh' }}>
      <Paper
        component="header"
        radius={0}
        py="md"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          borderTop: 0,
          borderLeft: 0,
          borderRight: 0,
          background: 'var(--app-header-bg-strong)',
        }}
      >
        <Container size="xl">
          <Group justify="space-between">
            <Anchor component={Link} to="/" c="inherit" underline="never">
              <Group gap="sm">
                <BrandLogo size={40} />
                <Stack gap={0}>
                  <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={labelStyle}>
                    privacy
                  </Text>
                  <BrandWordmark size={24} />
                </Stack>
              </Group>
            </Anchor>
            <Group gap="sm" wrap="nowrap">
              <LanguageSwitcher compact />
              <Button component={Link} to="/" variant="default" radius="xl" leftSection={<ArrowLeft width={16} height={16} />}>
                返回首页
              </Button>
            </Group>
          </Group>
        </Container>
      </Paper>

      <Container size="md" py="xl">
        <Stack gap="xl">
          <Group align="start">
            <ThemeIcon
              size={64}
              radius="xl"
              variant="light"
              color="brand"
              style={{
                background: 'var(--app-brand-soft-bg)',
                border: '1px solid var(--app-brand-soft-border)',
              }}
            >
              <Shield width={32} height={32} style={{ color: 'var(--app-brand-accent)' }} />
            </ThemeIcon>
            <Stack gap={6}>
              <Text size="xs" fw={700} c="dimmed" tt="uppercase" style={labelStyle}>
                policy
              </Text>
              <Title order={1}>隐私政策</Title>
              <Text size="sm" c="dimmed">我们重视并保护您的个人信息安全</Text>
            </Stack>
          </Group>

          <Paper p={{ base: 'lg', md: 'xl' }}>
            {loading ? (
              <Group justify="center" py={80}>
                <Loader color="brand" />
              </Group>
            ) : (
              <Box component="article" data-legal-content>
                <style>{legalArticleStyles}</style>
                <Box dangerouslySetInnerHTML={{ __html: convertMarkdownToHTML(content) }} />
              </Box>
            )}
          </Paper>
        </Stack>
      </Container>

      <Footer />
    </Box>
  )
}

function convertMarkdownToHTML(markdown: string): string {
  let html = markdown
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>')
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>')
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>')
  html = html.replace(/^#### (.*$)/gim, '<h4>$1</h4>')
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  const tableRegex = /\|(.+)\|/g
  html = html.replace(tableRegex, (match) => {
    if (match.includes('---')) return ''
    const cells = match.split('|').filter(cell => cell.trim())
    const cellsHTML = cells.map(cell => `<td>${cell.trim()}</td>`).join('')
    return `<tr>${cellsHTML}</tr>`
  })
  html = html.replace(/^- (.*$)/gim, '<li>$1</li>')
  html = html.replace(/^(\d+)\. (.*$)/gim, '<li>$2</li>')
  html = html.replace(/^(?!<[h|l|t])(.*$)/gim, '<p>$1</p>')
  html = html.replace(/\n\n/g, '<br/><br/>')
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
  html = html.replace(/^---$/gim, '<hr/>')
  return html
}
