import {
  Accordion,
  Anchor,
  Badge,
  Box,
  Button,
  Container,
  Divider,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Table,
  Text,
  ThemeIcon,
  Title,
} from '@mantine/core'
import { Link, Navigate, useParams } from 'react-router-dom'
import {
  ArrowRightIcon,
  Captions,
  CheckCircleIcon,
  DocumentTextIcon,
  FilmIcon,
  Mic,
  SparklesIcon,
  VideoCameraIcon,
} from '@/shared/icons/tabler'
import BrandWordmark from '@/shared/components/brand/BrandWordmark'
import Footer from '@/shared/components/layout/Footer'
import Seo from '@/shared/seo/Seo'
import MarkdownArticle from './MarkdownArticle'
import { getArticleMarkdown } from './articleContent'
import {
  RESOURCE_BASE_PATH,
  SITE_URL,
  getPagesByCategory,
  getRelatedPages,
  getResourceCanonical,
  getResourcePath,
  resourcePages,
  resourceCategories,
  resourcePagesBySlug,
  type ResourcePage,
} from './resourceData'

const centerDescription =
  'Explore NarratoAI workflows for AI video commentary, short video production, subtitles, captions, voiceover, movie recaps, podcast clips, and content repurposing.'

const workflowLabels = ['Upload', 'AI analysis', 'Script review', 'Voiceover and subtitles', 'Export']

const darkBackground =
  'radial-gradient(circle at 50% -12%, rgb(102 198 125 / 22%), rgb(102 198 125 / 0%) 28%), radial-gradient(circle at 78% 16%, rgb(91 148 255 / 16%), rgb(91 148 255 / 0%) 28%), linear-gradient(180deg, #05070b 0%, #07111f 58%, #05070b 100%)'

const darkPanelStyle = {
  background: 'rgb(255 255 255 / 7%)',
  border: '1px solid rgb(255 255 255 / 14%)',
  boxShadow: '0 28px 80px rgb(0 0 0 / 32%)',
}

const primaryDarkButtonStyles = {
  root: {
    background: '#ffffff',
    color: '#05070b',
    border: '1px solid rgb(255 255 255 / 86%)',
    fontWeight: 800,
  },
}

const secondaryDarkButtonStyles = {
  root: {
    background: 'rgb(255 255 255 / 8%)',
    color: '#ffffff',
    border: '1px solid rgb(255 255 255 / 18%)',
    fontWeight: 800,
  },
}

const lightPaperStyle = {
  borderColor: '#e4eaf2',
  boxShadow: 'none',
}

const comparisonRows = [
  {
    criteria: 'Starting point',
    manual: 'Blank timeline and manual notes',
    generic: 'Single prompt or isolated upload',
    narrato: 'Authorized source video, transcript, or creator brief',
  },
  {
    criteria: 'Production context',
    manual: 'Editor watches and labels everything',
    generic: 'Limited memory of scenes and subtitles',
    narrato: 'Subtitles, visual context, script, narration, and export stay connected',
  },
  {
    criteria: 'Review control',
    manual: 'Full control but slow iteration',
    generic: 'Fast output with uneven review points',
    narrato: 'Human review before voiceover and export',
  },
  {
    criteria: 'Best fit',
    manual: 'Detailed final polish',
    generic: 'One-off experiments',
    narrato: 'Repeatable video commentary and repurposing workflows',
  },
]

export default function ResourcesPage() {
  const { slug } = useParams()

  if (!slug) return <ResourceCenter />

  const page = resourcePagesBySlug.get(slug)
  if (!page) return <Navigate to={RESOURCE_BASE_PATH} replace />

  const articleMarkdown = getArticleMarkdown(slug)
  if (articleMarkdown) return <ResourceArticlePage markdown={articleMarkdown} page={page} />

  return <ResourceLandingPage page={page} />
}

function ResourceCenter() {
  const canonical = getResourceCanonical()

  return (
    <Box bg="#05070b" c="#102033" mih="100vh">
      <Seo
        canonical={canonical}
        description={centerDescription}
        jsonLd={buildCenterJsonLd()}
        title="AI Video Commentary and Short Video Workflows | NarratoAI"
      />
      <ResourceHeader />
      <Box component="main">
        <Box component="section" py={{ base: 56, md: 94 }} style={{ background: darkBackground }}>
          <Container size="xl">
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing={{ base: 32, md: 56 }} verticalSpacing={36}>
              <Stack gap="xl" justify="center">
                <Stack gap="md">
                  <Badge
                    w="fit-content"
                    radius="xl"
                    styles={{ root: { background: 'rgb(255 255 255 / 10%)', color: '#ffffff', border: '1px solid rgb(255 255 255 / 18%)' } }}
                  >
                    NarratoAI resources
                  </Badge>
                  <Title order={1} fz={{ base: 42, md: 68 }} lh={1.02} fw={800} c="#ffffff">
                    AI Video Commentary and Short Video Workflows
                  </Title>
                  <Text fz={{ base: 'lg', md: 22 }} lh={1.7} c="rgba(255,255,255,0.68)" maw={720}>
                    Learn how to turn authorized source videos into commentary scripts, movie recaps,
                    subtitles, captions, voiceover, short-form assets, and export-ready results.
                  </Text>
                </Stack>
                <Group gap="sm">
                  <Button
                    component={Link}
                    to="/register"
                    size="lg"
                    radius="xl"
                    rightSection={<ArrowRightIcon size={18} />}
                    styles={primaryDarkButtonStyles}
                  >
                    Start creating with NarratoAI
                  </Button>
                  <Button
                    component={Link}
                    to="/#features"
                    size="lg"
                    radius="xl"
                    variant="default"
                    styles={secondaryDarkButtonStyles}
                  >
                    View product workflow
                  </Button>
                </Group>
              </Stack>

              <WorkflowPreview
                eyebrow="Production workspace"
                title="Turn source footage into editable scripts, captions, narration, and reusable shorts."
                points={['Scene context', 'Reviewed scripts', 'Voiceover', 'Short-form exports']}
              />
            </SimpleGrid>
          </Container>
        </Box>

        <Box component="section" py={{ base: 48, md: 72 }} bg="#f6f8f6">
          <Container size="xl">
            <Stack gap={48}>
              {resourceCategories.map((category) => (
                <Stack key={category} gap="lg">
                  <Group justify="space-between" align="end">
                    <Stack gap={4}>
                      <Text tt="uppercase" size="xs" fw={800} c="green.7">
                        {category}
                      </Text>
                      <Title order={2} fz={{ base: 28, md: 36 }}>
                        {getCategoryTitle(category)}
                      </Title>
                    </Stack>
                    <Text c="#667085" maw={420} visibleFrom="md">
                      Each page is written around a specific search intent, with workflow detail,
                      related pages, and a direct path to the product.
                    </Text>
                  </Group>

                  <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
                    {getPagesByCategory(category).map((page) => (
                      <ResourceCard key={page.slug} page={page} />
                    ))}
                  </SimpleGrid>
                </Stack>
              ))}
            </Stack>
          </Container>
        </Box>
      </Box>
      <Footer />
    </Box>
  )
}

function ResourceLandingPage({ page }: { page: ResourcePage }) {
  const relatedPages = getRelatedPages(page)
  const canonical = getResourceCanonical(page.slug)

  return (
    <Box bg="#05070b" c="#102033" mih="100vh">
      <Seo
        canonical={canonical}
        description={page.metaDescription}
        jsonLd={buildPageJsonLd(page)}
        title={page.title}
      />
      <ResourceHeader />
      <Box component="main">
        <Box component="section" py={{ base: 48, md: 84 }} style={{ background: darkBackground }}>
          <Container size="xl">
            <Stack gap="xl">
              <Stack gap="xs">
                <Group gap={8}>
                  <Anchor component={Link} to={RESOURCE_BASE_PATH} c="#9be86f" fw={700}>
                    Resources
                  </Anchor>
                  <Text c="rgba(255,255,255,0.36)">/</Text>
                  <Text c="rgba(255,255,255,0.58)">{page.primaryKeyword}</Text>
                </Group>
                <Badge
                  w="fit-content"
                  radius="xl"
                  styles={{ root: { background: 'rgb(255 255 255 / 10%)', color: '#ffffff', border: '1px solid rgb(255 255 255 / 18%)' } }}
                >
                  {page.kicker}
                </Badge>
              </Stack>

              <SimpleGrid cols={{ base: 1, md: 2 }} spacing={{ base: 32, md: 56 }} verticalSpacing={36}>
                <Stack gap="xl" justify="center">
                  <Stack gap="md">
                    <Title order={1} fz={{ base: 40, md: 64 }} lh={1.03} fw={800} c="#ffffff">
                      {page.h1}
                    </Title>
                    <Text fz={{ base: 'lg', md: 22 }} lh={1.7} c="rgba(255,255,255,0.68)">
                      {page.hero}
                    </Text>
                    <Group gap={8}>
                      {page.secondaryKeywords.map((keyword) => (
                        <Badge
                          key={keyword}
                          radius="xl"
                          styles={{
                            root: {
                              background: 'rgb(155 232 111 / 12%)',
                              border: '1px solid rgb(155 232 111 / 28%)',
                              color: '#d9ffc8',
                            },
                          }}
                        >
                          {keyword}
                        </Badge>
                      ))}
                    </Group>
                  </Stack>
                  <Group gap="sm">
                    <Button
                      component={Link}
                      to="/register"
                      size="lg"
                      radius="xl"
                      rightSection={<ArrowRightIcon size={18} />}
                      styles={primaryDarkButtonStyles}
                    >
                      Start creating with NarratoAI
                    </Button>
                    <Button
                      component={Link}
                      to={RESOURCE_BASE_PATH}
                      size="lg"
                      radius="xl"
                      variant="default"
                      styles={secondaryDarkButtonStyles}
                    >
                      Explore all workflows
                    </Button>
                  </Group>
                </Stack>

                <WorkflowPreview
                  eyebrow="Production workspace"
                  title={page.searchIntent}
                  points={page.features}
                />
              </SimpleGrid>
            </Stack>
          </Container>
        </Box>

        <ContentBand bg="#ffffff">
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
            <Stack gap="md">
              <SectionEyebrow icon={<SparklesIcon size={18} />} label="Why people search this" />
              <Title order={2}>The production pain</Title>
              <Text c="#475467" fz="lg" lh={1.8}>
                {page.pain}
              </Text>
            </Stack>
            <Stack gap="md">
              <SectionEyebrow icon={<CheckCircleIcon size={18} />} label="NarratoAI fit" />
              <Title order={2}>Where this workflow helps</Title>
              <Text c="#475467" fz="lg" lh={1.8}>
                {page.uniqueAngle}
              </Text>
            </Stack>
          </SimpleGrid>
        </ContentBand>

        <ContentBand bg="#f1f6fb">
          <Stack gap="xl">
              <SectionTitle
                eyebrow="Workflow"
                title={`How to use NarratoAI for ${page.primaryKeyword}`}
                description="The workflow keeps source analysis, scripts, subtitles, voiceover, and export assets in one clear production path."
              />
            <SimpleGrid cols={{ base: 1, md: 5 }} spacing="md">
              {page.workflow.map((step, index) => (
                <Paper key={step} p="lg" radius={8} withBorder bg="#ffffff" style={lightPaperStyle}>
                  <Stack gap="sm">
                    <ThemeIcon color="green" variant="light" radius={8} size={40}>
                      <Text fw={800}>{index + 1}</Text>
                    </ThemeIcon>
                    <Title order={3} fz="md">{workflowLabels[index]}</Title>
                    <Text size="sm" lh={1.7} c="#667085">{step}</Text>
                  </Stack>
                </Paper>
              ))}
            </SimpleGrid>
          </Stack>
        </ContentBand>

        <ContentBand bg="#ffffff">
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
            <Stack gap="xl">
              <SectionTitle
                eyebrow="Audience"
                title="Who this page is for"
                description="These are the creators and teams most likely to search for this workflow."
              />
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                {page.who.map((person) => (
                  <Paper key={person} p="lg" radius={8} withBorder bg="#fbfdff" style={lightPaperStyle}>
                    <Group gap="sm" wrap="nowrap">
                      <ThemeIcon color="blue" variant="light" radius={8}>
                        <VideoCameraIcon size={18} />
                      </ThemeIcon>
                      <Text fw={700}>{person}</Text>
                    </Group>
                  </Paper>
                ))}
              </SimpleGrid>
            </Stack>

            <Stack gap="xl">
              <SectionTitle
                eyebrow="Feature proof"
                title="What NarratoAI connects"
                description="The page focuses on real product capabilities already present in the video workflow."
              />
              <Stack gap="sm">
                {page.features.map((feature, index) => (
                  <Group key={feature} gap="sm" wrap="nowrap" align="flex-start">
                    <ThemeIcon color={index % 2 === 0 ? 'green' : 'blue'} variant="light" radius={8}>
                      {index % 2 === 0 ? <Captions size={18} /> : <Mic size={18} />}
                    </ThemeIcon>
                    <Text c="#475467" lh={1.7}>{feature}</Text>
                  </Group>
                ))}
              </Stack>
            </Stack>
          </SimpleGrid>
        </ContentBand>

        <ContentBand bg="#f8fbff">
          <Stack gap="xl">
            <SectionTitle
              eyebrow="Comparison"
              title="Manual editing vs generic AI tools vs NarratoAI"
              description="This section helps bottom-of-funnel readers understand where the workflow fits before they sign up."
            />
            <Paper radius={8} withBorder bg="#ffffff" style={{ ...lightPaperStyle, overflow: 'hidden' }}>
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
                    <Table.Th>Criteria</Table.Th>
                    <Table.Th>Manual workflow</Table.Th>
                    <Table.Th>Generic AI tool</Table.Th>
                    <Table.Th>NarratoAI</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {comparisonRows.map((row) => (
                    <Table.Tr key={row.criteria}>
                      <Table.Td><Text fw={700}>{row.criteria}</Text></Table.Td>
                      <Table.Td>{row.manual}</Table.Td>
                      <Table.Td>{row.generic}</Table.Td>
                      <Table.Td><Text fw={700} c="green.8">{row.narrato}</Text></Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          </Stack>
        </ContentBand>

        <ContentBand bg="#ffffff">
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
            <Stack gap="xl">
              <SectionTitle
                eyebrow="FAQ"
                title="Questions before you start"
                description="Practical questions users ask before turning source material into publishable assets."
              />
              <Accordion
                radius={8}
                styles={{
                  item: {
                    background: '#ffffff',
                    border: '1px solid #e4eaf2',
                    boxShadow: 'none',
                    marginBottom: 10,
                  },
                  control: { color: '#102033' },
                  chevron: { color: '#102033' },
                  panel: { color: '#475467' },
                }}
              >
                {page.faq.map(([question, answer]) => (
                  <Accordion.Item key={question} value={question}>
                    <Accordion.Control><Text fw={700}>{question}</Text></Accordion.Control>
                    <Accordion.Panel>
                      <Text c="#475467" lh={1.7}>{answer}</Text>
                    </Accordion.Panel>
                  </Accordion.Item>
                ))}
              </Accordion>
            </Stack>

            <Stack gap="xl">
              <SectionTitle
                eyebrow="Related pages"
                title="Explore connected workflows"
                description="Internal links keep the SEO matrix navigable for readers and crawlers."
              />
              <Stack gap="md">
                {relatedPages.map((relatedPage) => (
                  <ResourceCard key={relatedPage.slug} page={relatedPage} compact />
                ))}
              </Stack>
            </Stack>
          </SimpleGrid>
        </ContentBand>

        <Box component="section" py={{ base: 56, md: 82 }} bg="#07152d" c="#ffffff">
          <Container size="lg">
            <Stack gap="lg" align="center" ta="center">
              <Badge color="green" variant="light">Start creating</Badge>
              <Title order={2} fz={{ base: 32, md: 48 }}>
                Build a clear video production workflow with NarratoAI
              </Title>
              <Text maw={760} c="rgba(255,255,255,0.72)" fz="lg" lh={1.7}>
                Move from authorized source material to scripts, subtitles, voiceover, recaps,
                captions, and export-ready assets without splitting the work across disconnected tools.
              </Text>
              <Button component={Link} to="/register" size="lg" radius={8} rightSection={<ArrowRightIcon size={18} />}>
                Start creating with NarratoAI
              </Button>
            </Stack>
          </Container>
        </Box>
      </Box>
      <Footer />
    </Box>
  )
}

function ResourceArticlePage({ markdown, page }: { markdown: string; page: ResourcePage }) {
  const relatedPages = getRelatedPages(page)
  const canonical = getResourceCanonical(page.slug)

  return (
    <Box bg="#05070b" c="#102033" mih="100vh">
      <Seo
        canonical={canonical}
        description={page.metaDescription}
        jsonLd={buildArticleJsonLd(page, markdown)}
        title={page.title}
        type="article"
      />
      <ResourceHeader />
      <Box component="main">
        <Box component="section" py={{ base: 48, md: 84 }} style={{ background: darkBackground }}>
          <Container size="lg">
            <Stack gap="xl">
              <Stack gap="sm">
                <Group gap={8}>
                  <Anchor component={Link} to={RESOURCE_BASE_PATH} c="#9be86f" fw={700}>
                    Resources
                  </Anchor>
                  <Text c="rgba(255,255,255,0.36)">/</Text>
                  <Text c="rgba(255,255,255,0.58)">{page.primaryKeyword}</Text>
                </Group>
                <Badge
                  w="fit-content"
                  radius="xl"
                  styles={{ root: { background: 'rgb(255 255 255 / 10%)', color: '#ffffff', border: '1px solid rgb(255 255 255 / 18%)' } }}
                >
                  {page.kicker}
                </Badge>
              </Stack>

              <Stack gap="md">
                <Title order={1} fz={{ base: 40, md: 64 }} lh={1.03} fw={800} c="#ffffff">
                  {page.h1}
                </Title>
                <Text fz={{ base: 'lg', md: 22 }} lh={1.7} c="rgba(255,255,255,0.68)" maw={860}>
                  {page.hero}
                </Text>
                <Group gap={8}>
                  {page.secondaryKeywords.map((keyword) => (
                    <Badge
                      key={keyword}
                      radius="xl"
                      styles={{
                        root: {
                          background: 'rgb(155 232 111 / 12%)',
                          border: '1px solid rgb(155 232 111 / 28%)',
                          color: '#d9ffc8',
                        },
                      }}
                    >
                      {keyword}
                    </Badge>
                  ))}
                </Group>
              </Stack>
            </Stack>
          </Container>
        </Box>

        <Box component="section" bg="#ffffff" py={{ base: 40, md: 64 }}>
          <Container size="md">
            <MarkdownArticle markdown={markdown} />
          </Container>
        </Box>

        <ContentBand bg="#f8fbff">
          <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
            <Stack gap="xl">
              <SectionTitle
                eyebrow="Next step"
                title="Turn the comparison into a real test"
                description="Upload one representative long video, review the first structured draft, then compare caption cleanup, clip quality, and export effort against your current workflow."
              />
              <Button component={Link} to="/register" size="lg" radius={8} rightSection={<ArrowRightIcon size={18} />} w="fit-content">
                Start creating with NarratoAI
              </Button>
            </Stack>

            <Stack gap="xl">
              <SectionTitle
                eyebrow="Related pages"
                title="Explore connected workflows"
                description="Keep moving through adjacent NarratoAI guides for clipping, subtitles, captions, and long-video repurposing."
              />
              <Stack gap="md">
                {relatedPages.map((relatedPage) => (
                  <ResourceCard key={relatedPage.slug} page={relatedPage} compact />
                ))}
              </Stack>
            </Stack>
          </SimpleGrid>
        </ContentBand>
      </Box>
      <Footer />
    </Box>
  )
}

function ResourceHeader() {
  return (
    <Box component="header" bg="#05070b" style={{ borderBottom: '1px solid rgb(255 255 255 / 10%)' }}>
      <Container size="xl" py="md">
        <Group justify="space-between" align="center">
          <Anchor component={Link} to="/" underline="never" aria-label="NarratoAI home">
            <Group gap="sm">
              <img src="/logos/logo-48x48.png" alt="" width={34} height={34} />
              <BrandWordmark size={22} tone="dark" />
            </Group>
          </Anchor>
          <Group gap="lg" visibleFrom="sm">
            <Anchor component={Link} to={RESOURCE_BASE_PATH} c="rgba(255,255,255,0.82)" fw={700} underline="never">
              Resources
            </Anchor>
            <Anchor component={Link} to="/#pricing" c="rgba(255,255,255,0.82)" fw={700} underline="never">
              Pricing
            </Anchor>
          </Group>
          <Button
            component={Link}
            to="/register"
            radius="xl"
            rightSection={<ArrowRightIcon size={16} />}
            styles={primaryDarkButtonStyles}
          >
            Sign up
          </Button>
        </Group>
      </Container>
    </Box>
  )
}

function WorkflowPreview({
  eyebrow,
  points,
  title,
}: {
  eyebrow: string
  points: string[]
  title: string
}) {
  const icons = [FilmIcon, DocumentTextIcon, Captions, Mic]
  const firstPoint = points[0] ?? 'Source context'
  const secondPoint = points[1] ?? 'Reviewed script'
  const thirdPoint = points[2] ?? 'Voiceover'

  return (
    <Paper p={{ base: 'lg', md: 30 }} radius={8} style={darkPanelStyle}>
      <Stack gap="lg">
        <Stack gap={6}>
          <Text tt="uppercase" size="xs" fw={800} c="#9be86f">
            {eyebrow}
          </Text>
          <Title order={2} fz={{ base: 22, md: 30 }} lh={1.18} c="#ffffff">
            {title}
          </Title>
        </Stack>

        <Box
          style={{
            background: 'linear-gradient(180deg, rgb(255 255 255 / 12%), rgb(255 255 255 / 6%))',
            border: '1px solid rgb(255 255 255 / 12%)',
            borderRadius: 8,
            overflow: 'hidden',
          }}
        >
          <Group px="md" py="sm" justify="space-between" style={{ borderBottom: '1px solid rgb(255 255 255 / 10%)' }}>
            <Group gap={6}>
              {['#ff6b6b', '#ffd43b', '#69db7c'].map((color) => (
                <Box key={color} w={8} h={8} bg={color} style={{ borderRadius: 999 }} />
              ))}
            </Group>
            <Text size="xs" fw={800} c="rgba(255,255,255,0.58)">
              Ready for export
            </Text>
          </Group>

          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing={0}>
            <Box p="md" style={{ borderRight: '1px solid rgb(255 255 255 / 10%)' }}>
              <Stack gap="sm">
                <Box
                  style={{
                    aspectRatio: '16 / 10',
                    background:
                      'linear-gradient(135deg, rgb(155 232 111 / 24%), rgb(91 148 255 / 18%)), linear-gradient(180deg, #182437, #0d1421)',
                    border: '1px solid rgb(255 255 255 / 12%)',
                    borderRadius: 8,
                    position: 'relative',
                  }}
                >
                  <Box
                    style={{
                      background: 'rgb(5 7 11 / 76%)',
                      borderRadius: 6,
                      bottom: 12,
                      height: 8,
                      left: 12,
                      position: 'absolute',
                      right: 42,
                    }}
                  />
                  <Box
                    style={{
                      background: '#9be86f',
                      borderRadius: 6,
                      bottom: 12,
                      height: 8,
                      left: 12,
                      position: 'absolute',
                      width: '44%',
                    }}
                  />
                </Box>
                <Group gap="xs" wrap="nowrap">
                  <ThemeIcon color="green" variant="light" radius={8} size={34}>
                    <FilmIcon size={18} />
                  </ThemeIcon>
                  <Stack gap={0}>
                    <Text size="xs" tt="uppercase" fw={800} c="#9be86f">
                      Source context
                    </Text>
                    <Text size="sm" fw={700} c="#ffffff" lineClamp={1}>
                      {firstPoint}
                    </Text>
                  </Stack>
                </Group>
              </Stack>
            </Box>

            <Stack gap="xs" p="md">
              {[secondPoint, thirdPoint, points[3] ?? 'Export assets'].map((point, index) => {
                const Icon = icons[index + 1] ?? SparklesIcon
                return (
                  <Group
                    key={point}
                    gap="sm"
                    wrap="nowrap"
                    p="sm"
                    style={{
                      background: 'rgb(5 7 11 / 32%)',
                      border: '1px solid rgb(255 255 255 / 10%)',
                      borderRadius: 8,
                    }}
                  >
                    <ThemeIcon color={index % 2 === 0 ? 'blue' : 'green'} variant="light" radius={8} size={34}>
                      <Icon size={18} />
                    </ThemeIcon>
                    <Text fw={700} c="#ffffff" size="sm">
                      {point}
                    </Text>
                  </Group>
                )
              })}
            </Stack>
          </SimpleGrid>
        </Box>

        <Divider color="rgb(255 255 255 / 14%)" />
        <Group justify="space-between" gap="md">
          <Stack gap={0}>
            <Text fz={28} fw={800} c="#ffffff">{resourcePages.length}</Text>
            <Text size="sm" c="rgba(255,255,255,0.56)">resource pages</Text>
          </Stack>
          <Stack gap={0}>
            <Text fz={28} fw={800} c="#ffffff">5</Text>
            <Text size="sm" c="rgba(255,255,255,0.56)">workflow steps</Text>
          </Stack>
          <Stack gap={0}>
            <Text fz={28} fw={800} c="#ffffff">1</Text>
            <Text size="sm" c="rgba(255,255,255,0.56)">production path</Text>
          </Stack>
        </Group>
      </Stack>
    </Paper>
  )
}

function ResourceCard({ compact = false, page }: { compact?: boolean; page: ResourcePage }) {
  return (
    <Paper
      component={Link}
      to={getResourcePath(page.slug)}
      p={compact ? 'md' : 'lg'}
      radius={8}
      withBorder
      bg="#ffffff"
      style={lightPaperStyle}
    >
      <Stack gap="sm">
        <Group gap="sm" justify="space-between" align="flex-start">
          <Badge color="green" variant="light" radius={8}>
            {page.category}
          </Badge>
          <ArrowRightIcon size={18} />
        </Group>
        <Title order={compact ? 4 : 3} fz={compact ? 'md' : 22} lh={1.25}>
          {page.h1}
        </Title>
        {!compact ? (
          <Text c="#667085" lh={1.7}>
            {page.searchIntent}
          </Text>
        ) : null}
        <Text size="sm" fw={700} c="green.8">
          {page.primaryKeyword}
        </Text>
      </Stack>
    </Paper>
  )
}

function ContentBand({
  bg,
  children,
}: {
  bg: string
  children: React.ReactNode
}) {
  return (
    <Box component="section" py={{ base: 48, md: 72 }} bg={bg}>
      <Container size="xl">{children}</Container>
    </Box>
  )
}

function SectionTitle({
  description,
  eyebrow,
  title,
}: {
  description: string
  eyebrow: string
  title: string
}) {
  return (
    <Stack gap="xs" maw={760}>
      <Text tt="uppercase" size="xs" fw={800} c="green.7">
        {eyebrow}
      </Text>
      <Title order={2} fz={{ base: 28, md: 40 }} lh={1.15}>
        {title}
      </Title>
      <Text c="#667085" fz="lg" lh={1.7}>
        {description}
      </Text>
    </Stack>
  )
}

function SectionEyebrow({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <Group gap="sm">
      <ThemeIcon color="green" variant="light" radius={8}>{icon}</ThemeIcon>
      <Text tt="uppercase" size="xs" fw={800} c="green.7">{label}</Text>
    </Group>
  )
}

function getCategoryTitle(category: ResourcePage['category']) {
  const titles: Record<ResourcePage['category'], string> = {
    'Core workflows': 'Core AI video production workflows',
    'Creator scenarios': 'Creator-led use cases',
    'Platform workflows': 'Short-form platform workflows',
    'Production use cases': 'Team and niche production use cases',
  }

  return titles[category]
}

function buildCenterJsonLd() {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: 'AI Video Commentary and Short Video Workflows',
      description: centerDescription,
      url: getResourceCanonical(),
      mainEntity: {
        '@type': 'ItemList',
        itemListElement: resourcePages.map((page, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: page.h1,
          url: getResourceCanonical(page.slug),
        })),
      },
      isPartOf: {
        '@type': 'WebSite',
        name: 'NarratoAI',
        url: `${SITE_URL}/`,
      },
    },
    buildBreadcrumbJsonLd([
      ['Home', `${SITE_URL}/`],
      ['Resources', getResourceCanonical()],
    ]),
  ]
}

function buildPageJsonLd(page: ResourcePage) {
  return [
    {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: page.h1,
      headline: page.h1,
      description: page.metaDescription,
      url: getResourceCanonical(page.slug),
      about: page.primaryKeyword,
      keywords: [page.primaryKeyword, ...page.secondaryKeywords].join(', '),
      isPartOf: {
        '@type': 'WebSite',
        name: 'NarratoAI',
        url: `${SITE_URL}/`,
      },
    },
    buildBreadcrumbJsonLd([
      ['Home', `${SITE_URL}/`],
      ['Resources', getResourceCanonical()],
      [page.h1, getResourceCanonical(page.slug)],
    ]),
    buildFaqJsonLd(page),
  ]
}

function buildArticleJsonLd(page: ResourcePage, markdown: string) {
  const checkedDate = readFrontmatterValue(markdown, 'last_checked')

  return [
    {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: page.h1,
      description: page.metaDescription,
      dateModified: checkedDate,
      datePublished: checkedDate,
      inLanguage: 'en-US',
      mainEntityOfPage: getResourceCanonical(page.slug),
      url: getResourceCanonical(page.slug),
      about: page.primaryKeyword,
      keywords: [page.primaryKeyword, ...page.secondaryKeywords].join(', '),
      author: {
        '@type': 'Organization',
        name: 'NarratoAI',
      },
      publisher: {
        '@type': 'Organization',
        name: 'NarratoAI',
        logo: {
          '@type': 'ImageObject',
          url: `${SITE_URL}/logos/logo-512x512.png`,
        },
      },
      isPartOf: {
        '@type': 'WebSite',
        name: 'NarratoAI',
        url: `${SITE_URL}/`,
      },
    },
    buildBreadcrumbJsonLd([
      ['Home', `${SITE_URL}/`],
      ['Resources', getResourceCanonical()],
      [page.h1, getResourceCanonical(page.slug)],
    ]),
  ]
}

function readFrontmatterValue(markdown: string, key: string) {
  const frontmatter = /^---\n([\s\S]*?)\n---/.exec(markdown)?.[1] ?? ''
  return new RegExp(`^${key}:\\s*"([^"]+)"`, 'm').exec(frontmatter)?.[1]
}

function buildFaqJsonLd(page: ResourcePage) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: page.faq.map(([question, answer]) => ({
      '@type': 'Question',
      name: question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: answer,
      },
    })),
  }
}

function buildBreadcrumbJsonLd(items: Array<[string, string]>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, item], index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name,
      item,
    })),
  }
}
