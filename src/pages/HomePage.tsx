/**
 * 数字人口播门户首页
 * 营销页统一收口到 Mantine 原语，Framer Motion 仅承担动画容器职责
 */

import { useEffect, useState, type RefObject } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  AspectRatio,
  Badge,
  Box,
  Button,
  Card,
  Center,
  Container,
  Group,
  Paper,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  ThemeIcon,
  Title,
  Image,
} from '@mantine/core'
import {
  Zap,
  Wand2,
  Clock,
  Captions,
  Film,
  FileText,
  ScanEye,
  Mic,
  FileDown,
  ShieldCheck,
  NoSymbolIcon,
  BadgeCheck,
  Gift,
} from '@/shared/icons/tabler'
import BrandLockup from '@/shared/components/brand/BrandLockup'
import LanguageSwitcher from '@/shared/components/i18n/LanguageSwitcher'
import PortalLayout from '@/shared/components/layout/PortalLayout'
import { useAuth, UserMenu } from '@/features/auth'
import { useTokenBalance } from '@/features/subscriptions/hooks'
import { useTokenPackages } from '@/features/subscriptions/hooks/useTokenPackages'
import { subscriptionService } from '@/features/subscriptions/services'
import type { SubscriptionPlanResponse } from '@/features/subscriptions/types'
import {
  FIRST_MONTH_PROMO_PRICE,
  YEARLY_SAVINGS_PERCENT,
  formatCurrencyPrice,
  hasFirstMonthPromotion,
} from '@/features/subscriptions/planPromotions'
import { useI18n } from '@/shared/i18n/I18nProvider'
import { useScrollAnimation } from '@/shared/hooks/useScrollAnimation'
import { brandHeroPosterUrl, brandHeroVideoUrl } from '@/shared/constants/brandMedia'
import {
  fadeInUp,
  fadeIn,
  staggerContainer,
  staggerItem,
} from '@/shared/utils/animations'

const features = [
  {
    icon: Captions,
    title: '人物照片',
    description: '上传一张单人照片，三个镜头共用同一个人物形象。',
  },
  {
    icon: Film,
    title: '三个机位',
    description: '固定正面、左前方和右前方，生成同一人物的多角度口播画面。',
  },
  {
    icon: FileText,
    title: '中文口播稿',
    description: '直接使用你写好的稿件配音，按句子安排镜头，不改写原文。',
  },
  {
    icon: ScanEye,
    title: '字级字幕',
    description: '按实际发音对齐字幕、重点强调和切镜，嘴型和声音走同一条配音。',
  },
  {
    icon: Mic,
    title: '整稿配音',
    description: '先生成一条连续人声，再按句子切到对应镜头，保持音色和语速一致。',
  },
  {
    icon: FileDown,
    title: '预览下载',
    description: '查看每个镜头的进度，成片完成后直接预览和下载竖屏 MP4。',
  },
] as const

const workflowSteps = [
  { number: '01', title: '上传照片', description: '上传一张单人正面或轻微侧脸照片，作为全部镜头的形象参考。' },
  { number: '02', title: '填写稿件', description: '输入中文口播稿和可选标题，系统按句子规划三个镜头。' },
  { number: '03', title: '生成口播', description: '完成配音、三个机位的人物视频、字幕和画面合成。' },
  { number: '04', title: '预览下载', description: '在页面查看进度，成片完成后直接预览和下载。' },
] as const

const complianceItems = [
  {
    icon: ShieldCheck,
    title: '只处理自有或已授权素材',
    description: '数字人口播不提供第三方内容下载、抓取或破解能力。人物照片和口播稿需由你本人提供并拥有合法权利。',
  },
  {
    icon: NoSymbolIcon,
    title: '禁止 NSFW 与人脸滥用',
    description: '服务条款明确禁止色情、NSFW、性暗示、换脸、Deepfake、冒充他人等高风险用途。',
  },
  {
    icon: BadgeCheck,
    title: '公开计费与可达支持',
    description: '订阅价格、每月额度和 Credits 发放规则在页面上公开展示。',
  },
] as const

const useCases = [
  {
    title: '账号口播更新',
    description: '固定人物形象和声音，按新稿件持续生成可发布的口播视频。',
    image:
      'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800&auto=format&fit=crop',
  },
  {
    title: '品牌讲解',
    description: '把产品说明写成口播稿，用同一位数字人讲清楚卖点。',
    image:
      'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=800&auto=format&fit=crop',
  },
  {
    title: '课程讲解',
    description: '把课程讲稿交给同一人物形象，生成可预览和下载的讲解视频。',
    image:
      'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&auto=format&fit=crop',
  },
] as const

const elevatedSurfaceStyle = {
  background:
    'linear-gradient(180deg, rgb(255 255 255 / 7%), rgb(255 255 255 / 3%))',
  borderColor: 'rgb(255 255 255 / 14%)',
  boxShadow: '0 24px 90px rgb(0 0 0 / 35%)',
  backdropFilter: 'blur(18px)',
} as const

const brandSoftIconStyles = {
  root: {
    background:
      'radial-gradient(circle at 35% 25%, rgb(255 255 255 / 22%), rgb(224 122 69 / 22%) 42%, rgb(255 255 255 / 6%) 100%)',
    border: '1px solid rgb(255 255 255 / 22%)',
    color: '#ffffff',
    boxShadow: '0 0 26px rgb(224 122 69 / 22%)',
  },
} as const

const sectionShellStyle = {
  position: 'relative',
  overflow: 'hidden',
  background:
    'radial-gradient(circle at 50% 0%, rgb(224 122 69 / 16%), rgb(224 122 69 / 0%) 28%), linear-gradient(180deg, #000000 0%, #120e0c 58%, #000000 100%)',
  color: '#ffffff',
} as const

const sectionShellAltStyle = {
  position: 'relative',
  overflow: 'hidden',
  background:
    'radial-gradient(circle at 18% 14%, rgb(63 148 255 / 12%), rgb(63 148 255 / 0%) 32%), radial-gradient(circle at 82% 0%, rgb(255 255 255 / 8%), rgb(255 255 255 / 0%) 28%), linear-gradient(180deg, #05070b 0%, #000000 100%)',
  color: '#ffffff',
} as const

const sectionTopLineStyle = {
  position: 'absolute',
  insetInline: 0,
  top: 0,
  height: 1,
  background:
    'linear-gradient(90deg, rgb(255 255 255 / 0%), rgb(255 255 255 / 20%), rgb(255 255 255 / 0%))',
} as const

const heroButtonStyles = {
  root: {
    borderRadius: 999,
    border: '1px solid rgb(255 255 255 / 18%)',
    backdropFilter: 'blur(12px)',
  },
} as const

const heroGlassButtonStyles = {
  root: {
    height: 38,
    paddingInline: 18,
    border: '1px solid transparent',
    background: 'transparent',
    color: '#ffffff',
    fontWeight: 600,
    transition: 'background 160ms ease, border-color 160ms ease',
    '&:hover': {
      background: 'rgb(255 255 255 / 12%)',
      borderColor: 'rgb(255 255 255 / 10%)',
    },
  },
} as const

const heroToolbarDividerStyle = {
  width: 1,
  height: 36,
  background: 'linear-gradient(180deg, rgb(255 255 255 / 0%), rgb(255 255 255 / 18%), rgb(255 255 255 / 0%))',
} as const

const heroConsoleButtonStyles = {
  root: {
    height: 40,
    paddingInline: 12,
    border: '1px solid transparent',
    background: 'transparent',
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 500,
    letterSpacing: 0,
    '&:hover': {
      background: 'rgb(255 255 255 / 7%)',
    },
  },
} as const

const ESTIMATED_CREDITS_PER_VIDEO = 300
const DEFAULT_TIER_VIDEO_LIMITS = [20, 50, 150] as const
const PLAN_VIDEO_LIMITS: Record<string, number> = { basic: 20, pro: 50, promax: 150 }
const getMonthlyCredits = (plan: SubscriptionPlanResponse) => plan.monthly_credits ?? plan.monthly_token_limit
const parsePrice = (price: string | number | null | undefined) => {
  const value = Number(price)
  return Number.isFinite(value) ? value : 0
}
const formatPlanPrice = (plan: SubscriptionPlanResponse) => formatCurrencyPrice(plan.currency, parsePrice(plan.price_monthly))
const getConfiguredVideoLimit = (plan: SubscriptionPlanResponse) => {
  for (const key of ['monthly_video_limit', 'monthly_video_count', 'estimated_monthly_videos', 'estimated_videos', 'video_limit']) {
    const value = Number(plan.limits?.[key])
    if (Number.isFinite(value) && value > 0) return Math.round(value)
  }
  return null
}
const normalizePlanKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '')
const getTierVideoLimit = (plan: SubscriptionPlanResponse, index: number) => {
  const matchedKey = [plan.name, plan.display_name].map(normalizePlanKey).find((key) => PLAN_VIDEO_LIMITS[key])
  return matchedKey ? PLAN_VIDEO_LIMITS[matchedKey] : (DEFAULT_TIER_VIDEO_LIMITS[index] ?? null)
}
const getEstimatedVideoLimit = (plan: SubscriptionPlanResponse, index: number) => {
  return getTierVideoLimit(plan, index) ?? getConfiguredVideoLimit(plan) ?? Math.max(1, Math.round(getMonthlyCredits(plan) / ESTIMATED_CREDITS_PER_VIDEO))
}

export default function HomePage() {
  return (
    <PortalLayout showHeader={false}>
      <HeroSection />
      <FeaturesSection />
      <WorkflowSection />
      <UseCasesSection />
      <PricingSection />
      <ComplianceSection />
      <CTASection />
    </PortalLayout>
  )
}

function HeroSection() {
  return (
    <motion.section initial="hidden" animate="visible" variants={staggerContainer(0.18)}>
      <Box
        component="section"
        pos="relative"
        style={{
          minHeight: 'min(84vh, 752px)',
          overflow: 'hidden',
          background: '#000000',
          color: '#ffffff',
        }}
      >
        <Box
          component="video"
          src={brandHeroVideoUrl}
          poster={brandHeroPosterUrl}
          autoPlay
          muted
          loop
          playsInline
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
        <Box
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgb(28 20 16 / 62%), rgb(0 0 0 / 68%))',
          }}
        />

        <HeroNavbar />

        <Container
          size={820}
          px={{ base: 20, sm: 32 }}
          style={{
            position: 'relative',
            zIndex: 1,
          }}
        >
          <Stack
            align="center"
            gap={28}
            w="100%"
            pt={{ base: 136, md: 172, lg: 200 }}
            pb={{ base: 56, md: 64, lg: 72 }}
          >
            <HeroBadge />

            <Stack gap={18} align="center" w="100%">
              <motion.div variants={fadeInUp} style={{ width: '100%' }}>
                <Title
                  order={1}
                  ta="center"
                  maw={760}
                  mx="auto"
                  style={{
                    fontSize: 'clamp(2.25rem, 7vw, 3.5rem)',
                    lineHeight: 1.28,
                    letterSpacing: 0,
                    fontWeight: 500,
                    color: 'transparent',
                    background:
                      'linear-gradient(144.5deg, #ffffff 28%, rgb(0 0 0 / 0%) 115%)',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  数字人口播：一张照片，生成口播视频
                </Title>
              </motion.div>

              <motion.div variants={fadeInUp}>
                <Text
                  ta="center"
                  maw={680}
                  style={{
                    color: 'rgb(255 255 255 / 70%)',
                    fontSize: 15,
                    fontWeight: 400,
                    lineHeight: 1.7,
                  }}
                >
                  上传一张人物照片，填入中文口播稿。系统完成配音、三个机位的人物视频、
                  字级字幕和画面合成，生成可预览、可下载的竖屏口播视频。
                </Text>
              </motion.div>
            </Stack>

            <motion.div variants={fadeInUp}>
              <Group justify="center">
                <HeroActionButton tone="light" />
              </Group>
            </motion.div>
          </Stack>
        </Container>
      </Box>
    </motion.section>
  )
}

function HeroNavbar() {
  const navItems = [
    { label: '功能亮点', href: '#features' },
    { label: '工作流程', href: '#workflow' },
    { label: '价格方案', href: '#pricing' },
    { label: '资源', href: '/resources' },
  ] as const

  return (
    <Group
      component="nav"
      justify="space-between"
      align="center"
      wrap="nowrap"
      px={{ base: 20, md: 32, lg: 64, xl: 120 }}
      py={20}
      style={{
        position: 'absolute',
        insetInline: 0,
        top: 0,
        zIndex: 2,
      }}
    >
      <Group gap={42} wrap="nowrap">
        <Box
          component={Link}
          to="/"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            color: '#ffffff',
          }}
        >
          <BrandLockup markSize={36} size={22} tone="dark" />
        </Box>

        <Group visibleFrom="lg" gap={30} wrap="nowrap">
          {navItems.map((item) => (
            <HeroNavLink key={item.label} {...item} />
          ))}
        </Group>
      </Group>

      <HeroAccountActions />
    </Group>
  )
}

function HeroAccountActions() {
  const { isAuthenticated, isInitialized, isLoading } = useAuth()

  if (!isInitialized && isLoading) {
    return (
      <Group gap={14} wrap="nowrap">
        <Box visibleFrom="sm" aria-hidden="true" style={heroToolbarDividerStyle} />
        <LanguageSwitcher compact tone="inverse" variant="icon" />
        <Button
          loading
          disabled
          radius="xl"
          variant="subtle"
          color="gray"
          styles={{
            root: {
              ...heroGlassButtonStyles.root,
              background: 'rgb(255 255 255 / 10%)',
              borderColor: 'rgb(255 255 255 / 18%)',
              boxShadow: 'inset 0 1px 0 rgb(255 255 255 / 12%), 0 10px 26px rgb(0 0 0 / 18%)',
              backdropFilter: 'blur(14px)',
            },
          }}
        >
          账户
        </Button>
      </Group>
    )
  }

  if (isAuthenticated) {
    return <HeroAuthenticatedActions />
  }

  return (
    <Group gap={12} wrap="nowrap">
      <Box visibleFrom="sm" aria-hidden="true" style={heroToolbarDividerStyle} />
      <LanguageSwitcher compact tone="inverse" variant="icon" />
      <Button
        component={Link}
        to="/login"
        radius="xl"
        variant="subtle"
        color="gray"
        visibleFrom="sm"
        styles={{
          root: {
            ...heroButtonStyles.root,
            color: '#ffffff',
            background: 'rgb(0 0 0 / 16%)',
          },
        }}
      >
        登录
      </Button>
      <Button
        component={Link}
        to="/register"
        radius="xl"
        variant="filled"
        color="gray"
        styles={{
          root: {
            ...heroButtonStyles.root,
            background: '#ffffff',
            color: '#000000',
          },
        }}
      >
        注册
      </Button>
    </Group>
  )
}

function HeroAuthenticatedActions() {
  const { balance } = useTokenBalance()
  const remainingCredits = balance?.remaining_credits ?? balance?.remaining_tokens ?? 0

  return (
    <Group gap={14} wrap="nowrap">
      <Box visibleFrom="sm" aria-hidden="true" style={heroToolbarDividerStyle} />
      <LanguageSwitcher compact tone="inverse" variant="icon" />
      <Button
        component={Link}
        to="/projects"
        radius="xl"
        variant="subtle"
        color="gray"
        visibleFrom="sm"
        styles={heroConsoleButtonStyles}
      >
        进入控制台
      </Button>
      <Stack visibleFrom="sm" gap={4} align="center" style={{ minWidth: 48 }}>
        <Text
          data-i18n-skip
          size="sm"
          fw={500}
          c="#ffffff"
          style={{ letterSpacing: 0, lineHeight: 1 }}
        >
          CREDITS
        </Text>
        <Group gap={4} wrap="nowrap">
          <Zap width={14} height={14} color="#ffffff" stroke={1.9} />
          <Text data-i18n-skip size="sm" fw={500} c="#ffffff" style={{ lineHeight: 1 }}>
            {remainingCredits.toLocaleString()}
          </Text>
        </Group>
      </Stack>
      <UserMenu compact embedded tone="inverse" showChevron={false} />
    </Group>
  )
}

function HeroNavLink({ href, label }: { href: string; label: string }) {
  return (
    <Box
      component="a"
      href={href}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        color: '#ffffff',
        fontSize: 14,
        fontWeight: 500,
        lineHeight: 1,
        whiteSpace: 'nowrap',
      }}
    >
      <span>{label}</span>
    </Box>
  )
}

function HeroBadge() {
  return (
    <motion.div variants={fadeIn}>
      <Paper
        radius={20}
        px={14}
        py={8}
        style={{
          background: 'rgb(255 255 255 / 10%)',
          border: '1px solid rgb(255 255 255 / 20%)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <Group gap={8} wrap="nowrap">
          <Box
            aria-hidden="true"
            style={{
              width: 4,
              height: 4,
              borderRadius: 999,
              background: '#ffffff',
              flex: '0 0 auto',
            }}
          />
          <Text
            component="span"
            style={{
              color: 'rgb(255 255 255 / 60%)',
              fontSize: 13,
              fontWeight: 500,
              lineHeight: 1,
            }}
          >
            产品已开放使用
            <Text component="span" inherit style={{ color: '#ffffff' }}>
              {' '}
              人物照片 · 口播稿 · 多角度成片
            </Text>
          </Text>
        </Group>
      </Paper>
    </motion.div>
  )
}

function HeroActionButton({
  label = '免费注册开始创作',
  tone,
}: {
  label?: string
  tone: 'dark' | 'light'
}) {
  const isLight = tone === 'light'

  return (
    <Box
      component={Link}
      to="/register"
      style={{
        position: 'relative',
        display: 'inline-flex',
        padding: 2,
        borderRadius: 999,
        border: '0.6px solid #ffffff',
        color: isLight ? '#000000' : '#ffffff',
        overflow: 'hidden',
      }}
    >
      <Box
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: -4,
          left: '18%',
          width: '64%',
          height: 12,
          background: 'linear-gradient(90deg, rgb(255 255 255 / 0%), #ffffff, rgb(255 255 255 / 0%))',
          filter: 'blur(8px)',
          opacity: 0.7,
        }}
      />
      <Box
        component="span"
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 999,
          background: isLight ? '#ffffff' : '#000000',
          padding: '11px 29px',
          fontSize: 14,
          fontWeight: 500,
          lineHeight: 1,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </Box>
    </Box>
  )
}

function FeaturesSection() {
  const { ref, isInView } = useScrollAnimation()

  return (
    <Box
      component="section"
      id="features"
      pt={{ base: 38, md: 48 }}
      pb={{ base: 64, md: 72 }}
      style={sectionShellStyle}
    >
      <Box aria-hidden="true" style={sectionTopLineStyle} />
      <Container size="xl">
        <SectionHeading
          badge="口播制作"
          title="从人物照片到可发布的口播视频"
          description="同一张照片完成配音、三个机位、字级字幕和成片合成，不用在多个工具之间来回倒素材。"
        />

        <motion.div
          ref={ref as RefObject<HTMLDivElement>}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          variants={staggerContainer(0.1)}
        >
          <motion.div variants={staggerContainer(0.14)}>
            <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing={{ base: 'md', md: 'lg' }}>
              {features.map((feature) => (
                <FeatureCard key={feature.title} {...feature} />
              ))}
            </SimpleGrid>
          </motion.div>
        </motion.div>
      </Container>
    </Box>
  )
}

function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Wand2
  title: string
  description: string
}) {
  return (
    <motion.div variants={staggerItem}>
      <Card
        withBorder
        radius={20}
        padding={28}
        h="100%"
        style={{
          ...elevatedSurfaceStyle,
          minHeight: 214,
        }}
      >
        <Stack gap="xl" h="100%">
          <ThemeIcon
            size={46}
            radius="xl"
            variant="light"
            color="gray"
            styles={{
              root: brandSoftIconStyles.root,
            }}
          >
            <Icon width={22} height={22} />
          </ThemeIcon>
          <Stack gap={10} mt="auto">
            <Title
              order={3}
              style={{
                color: '#ffffff',
                fontSize: 20,
                fontWeight: 500,
                letterSpacing: 0,
              }}
            >
              {title}
            </Title>
            <Text
              lh={1.75}
              style={{
                color: 'rgb(255 255 255 / 62%)',
                fontSize: 14,
              }}
            >
              {description}
            </Text>
          </Stack>
        </Stack>
      </Card>
    </motion.div>
  )
}

function WorkflowSection() {
  const { ref, isInView } = useScrollAnimation()

  return (
    <Box
      component="section"
      id="workflow"
      py={{ base: 84, md: 120 }}
      style={sectionShellAltStyle}
    >
      <Box aria-hidden="true" style={sectionTopLineStyle} />
      <Container size="xl">
        <motion.div
          ref={ref as RefObject<HTMLDivElement>}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          variants={staggerContainer(0.1)}
        >
          <SectionHeading
            badge="制作步骤"
            title="四步完成一条口播视频"
            description="照片和稿件由你提供，配音、三镜画面、字幕和合成按顺序自动完成。"
          />

          <motion.div variants={staggerContainer(0.16)}>
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="lg">
              {workflowSteps.map((step) => (
                <WorkflowStep key={step.number} {...step} />
              ))}
            </SimpleGrid>
          </motion.div>
        </motion.div>
      </Container>
    </Box>
  )
}

function WorkflowStep({
  number,
  title,
  description,
}: {
  number: string
  title: string
  description: string
}) {
  return (
    <motion.div variants={staggerItem}>
      <Paper
        withBorder
        radius={20}
        p={26}
        h="100%"
        style={{
          ...elevatedSurfaceStyle,
          minHeight: 172,
        }}
      >
        <Stack align="center" ta="center" gap="lg">
          <Center
            w={58}
            h={58}
            style={{
              borderRadius: 999,
              background:
                'radial-gradient(circle, rgb(255 255 255 / 18%) 0%, rgb(224 122 69 / 10%) 68%, rgb(255 255 255 / 5%) 100%)',
              border: '1px solid rgb(255 255 255 / 34%)',
              boxShadow: '0 0 34px rgb(224 122 69 / 18%)',
            }}
          >
            <Text size="sm" fw={600} style={{ color: '#dbe7ff' }}>
              {number}
            </Text>
          </Center>
          <Stack gap={8}>
            <Title order={3} size="h4" style={{ color: '#ffffff', letterSpacing: 0 }}>
              {title}
            </Title>
            <Text size="sm" lh={1.7} style={{ color: 'rgb(255 255 255 / 58%)' }}>
              {description}
            </Text>
          </Stack>
        </Stack>
      </Paper>
    </motion.div>
  )
}

function UseCasesSection() {
  const { ref, isInView } = useScrollAnimation()

  return (
    <Box component="section" py={{ base: 84, md: 124 }} style={sectionShellStyle}>
      <Box aria-hidden="true" style={sectionTopLineStyle} />
      <Container size="xl">
        <motion.div
          ref={ref as RefObject<HTMLDivElement>}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          variants={staggerContainer(0.1)}
        >
          <SectionHeading
            badge="使用场景"
            title="一条人物形象，持续生产口播内容"
            description="个人账号、品牌讲解和课程口播都可以用同一张照片反复生成竖屏视频。"
          />

          <motion.div variants={staggerContainer(0.16)}>
            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
              {useCases.map((useCase) => (
                <UseCaseCard key={useCase.title} {...useCase} />
              ))}
            </SimpleGrid>
          </motion.div>
        </motion.div>
      </Container>
    </Box>
  )
}

function UseCaseCard({
  title,
  description,
  image,
}: {
  title: string
  description: string
  image: string
}) {
  return (
    <motion.div variants={staggerItem}>
      <Card
        withBorder
        radius={20}
        padding={0}
        h="100%"
        style={{
          overflow: 'hidden',
          ...elevatedSurfaceStyle,
        }}
      >
        <Card.Section>
          <AspectRatio ratio={16 / 9}>
            <Image
              src={image}
              alt={title}
              style={{
                filter: 'saturate(0.9) contrast(1.05)',
              }}
            />
          </AspectRatio>
        </Card.Section>
        <Stack gap="sm" p={26}>
          <Badge
            radius="xl"
            w="fit-content"
            styles={{
              root: {
                background: 'rgb(255 255 255 / 9%)',
                border: '1px solid rgb(255 255 255 / 18%)',
                color: '#dbe7ff',
              },
            }}
          >
            高效生产
          </Badge>
          <Title order={3} size="h4" style={{ color: '#ffffff', letterSpacing: 0 }}>
            {title}
          </Title>
          <Text lh={1.7} style={{ color: 'rgb(255 255 255 / 60%)' }}>
            {description}
          </Text>
        </Stack>
      </Card>
    </motion.div>
  )
}

function PricingSection() {
  const { ref, isInView } = useScrollAnimation()
  const { packages, isLoading, error } = useTokenPackages()
  const regularPackage = packages.find(pkg => !pkg.is_trial && !pkg.is_deleted
    && Number.isFinite(Number(pkg.price)) && Number(pkg.price) > 0)
  const credits = regularPackage && (regularPackage.total_credits_with_bonus
    ?? regularPackage.total_tokens_with_bonus
    ?? (regularPackage.credit_amount ?? regularPackage.token_amount) + (regularPackage.bonus_credits ?? regularPackage.bonus_tokens ?? 0))
  return (
    <Box component="section" id="pricing" py={{ base: 84, md: 124 }} style={sectionShellAltStyle}>
      <Box aria-hidden="true" style={sectionTopLineStyle} />
      <Container size="xl">
        <motion.div ref={ref as RefObject<HTMLDivElement>} initial="hidden" animate={isInView ? 'visible' : 'hidden'} variants={staggerContainer(0.1)}>
          <SectionHeading
            badge="Credits 充值"
            title="一次购买，按需使用"
            description="人民币计价，支持微信和支付宝扫码支付；每笔 Credits 到账后 30 天有效。"
          />
          <Paper withBorder radius={8} p={{ base: 'xl', md: 36 }} style={elevatedSurfaceStyle}>
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
              <Stack gap="md">
                {isLoading ? <Text role="status" c="dimmed">正在加载充值套餐…</Text>
                  : error ? <Text c="dimmed">暂时无法加载套餐价格，请查看全部充值套餐。</Text>
                    : regularPackage ? <>
                      <Badge color="blue" variant="light" w="fit-content">{regularPackage.display_name}</Badge>
                      <Group align="end" gap="sm"><Text size="2.8rem" fw={700} c="white">¥{Number(regularPackage.price).toFixed(2)}</Text><Text c="dimmed" mb={7}>{credits?.toLocaleString('zh-CN')} Credits</Text></Group>
                      <FeatureLine icon={Clock} text="到账后 30 天有效" />
                      <FeatureLine icon={Mic} text="微信 / 支付宝扫码支付" />
                    </> : <Text c="dimmed">暂无在售充值套餐</Text>}
              </Stack>
              <Stack justify="center" align="stretch">
                <Button component={Link} to="/pricing" radius="xl" size="lg">查看全部充值套餐</Button>
                <Text size="sm" c="dimmed">实际消耗随视频时长、模型和处理复杂度变化。</Text>
              </Stack>
            </SimpleGrid>
          </Paper>
        </motion.div>
      </Container>
    </Box>
  )
}

export function LegacySubscriptionPricingSection() {
  const { ref, isInView } = useScrollAnimation()
  const [plans, setPlans] = useState<SubscriptionPlanResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    const loadPlans = async () => {
      try {
        setIsLoading(true)
        setError(null)
        const response = await subscriptionService.listPlans()
        const activePlans = (response.items || [])
          .filter((plan) => plan.is_active)
          .sort((a, b) => a.sort_order - b.sort_order)

        if (isMounted) {
          setPlans(activePlans)
        }
      } catch (err) {
        if (isMounted) {
          setPlans([])
          setError(err instanceof Error ? err.message : '加载订阅计划失败')
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void loadPlans()

    return () => {
      isMounted = false
    }
  }, [])

  return (
    <Box
      component="section"
      id="pricing"
      py={{ base: 84, md: 124 }}
      style={sectionShellAltStyle}
    >
      <Box aria-hidden="true" style={sectionTopLineStyle} />
      <Container size="xl">
        <motion.div
          ref={ref as RefObject<HTMLDivElement>}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          variants={staggerContainer(0.1)}
        >
          <SectionHeading
            badge="订阅价格"
            title="订阅制价格，按月覆盖稳定视频创作"
            description="月付订阅，Credits 按月发放；实际消耗会随视频长度和复杂度浮动。"
          />

          {isLoading ? (
            <PricingSkeletonGrid />
          ) : error || plans.length === 0 ? (
            <Paper
              withBorder
              radius={20}
              p={28}
              ta="center"
              style={elevatedSurfaceStyle}
            >
              <Text style={{ color: 'rgb(255 255 255 / 68%)' }}>
                {error || '暂无可用订阅计划'}
              </Text>
            </Paper>
          ) : (
            <motion.div variants={staggerContainer(0.14)}>
              <SimpleGrid cols={{ base: 1, md: plans.length >= 3 ? 3 : plans.length === 2 ? 2 : 1 }} spacing="lg">
                {plans.map((plan, index) => (
                  <PricingCard key={plan.id} plan={plan} index={index} />
                ))}
              </SimpleGrid>
            </motion.div>
          )}
        </motion.div>
      </Container>
    </Box>
  )
}

function PricingCard({
  plan,
  index,
}: {
  plan: SubscriptionPlanResponse
  index: number
}) {
  const { t } = useI18n()
  const { isAuthenticated } = useAuth()
  const highlighted = plan.is_featured === true
  const formatCredits = (credits: number) => credits.toLocaleString()
  const monthlyCreditsValue = getMonthlyCredits(plan)
  const monthlyCredits = formatCredits(monthlyCreditsValue)
  const videoLimit = getEstimatedVideoLimit(plan, index)
  const subscribeTo = isAuthenticated ? '/subscription' : '/login'
  const subscribeState = isAuthenticated ? undefined : { from: { pathname: '/subscription' } }
  const hasMonthlyIntroPromotion = hasFirstMonthPromotion(plan)

  return (
    <motion.div variants={staggerItem}>
      <Card
        withBorder
        radius={20}
        padding={28}
        h="100%"
        style={{
          ...elevatedSurfaceStyle,
          borderColor: highlighted ? 'rgb(255 255 255 / 42%)' : elevatedSurfaceStyle.borderColor,
          boxShadow: highlighted
            ? '0 0 0 1px rgb(255 255 255 / 10%), 0 28px 100px rgb(224 122 69 / 16%)'
            : elevatedSurfaceStyle.boxShadow,
        }}
      >
        <Stack h="100%" gap="md">
          <Group justify="space-between" align="start">
            <Title order={3} style={{ color: '#ffffff', letterSpacing: 0 }}>
              {plan.display_name}
            </Title>
            {highlighted && (
              <Badge
                radius="xl"
                styles={{
                  root: {
                    background: 'rgb(255 255 255 / 10%)',
                    border: '1px solid rgb(255 255 255 / 20%)',
                    color: '#ffffff',
                  },
                }}
              >
                最推荐
              </Badge>
            )}
          </Group>

          {hasMonthlyIntroPromotion ? (
            <Stack gap={8}>
              <Group gap="xs" align="center">
                <Badge
                  radius="xl"
                  leftSection={<Gift size={13} />}
                  styles={{
                    root: {
                      background: 'rgb(34 197 94 / 14%)',
                      border: '1px solid rgb(134 239 172 / 28%)',
                      color: '#bbf7d0',
                    },
                  }}
                >
                  {t('首月优惠')}
                </Badge>
                <Text size="sm" style={{ color: 'rgb(255 255 255 / 56%)' }}>
                  {t('首月优惠价')}
                </Text>
              </Group>
              <Group gap="sm" align="end">
                <Text
                  size="2.5rem"
                  fw={700}
                  lh={1}
                  style={{ color: '#ffffff' }}
                >
                  {formatCurrencyPrice(plan.currency, FIRST_MONTH_PROMO_PRICE)}
                </Text>
                <Text
                  size="lg"
                  mb={3}
                  style={{
                    color: 'rgb(255 255 255 / 42%)',
                    textDecoration: 'line-through',
                  }}
                >
                  {formatPlanPrice(plan)}
                </Text>
              </Group>
              <Text size="sm" style={{ color: 'rgb(255 255 255 / 56%)' }}>
                {t('首月后按原月费续订')}
              </Text>
              <Text size="sm" style={{ color: 'rgb(255 255 255 / 56%)' }}>
                {t(`月付，每月发放 ${monthlyCredits} Credits`)}
              </Text>
            </Stack>
          ) : (
            <Stack gap={4}>
              <Text
                size="2.5rem"
                fw={700}
                lh={1}
                style={{ color: highlighted ? '#ffffff' : '#dbe7ff' }}
              >
                {formatPlanPrice(plan)}
              </Text>
              <Text size="sm" style={{ color: 'rgb(255 255 255 / 56%)' }}>
                {t(`月付，每月发放 ${monthlyCredits} Credits`)}
              </Text>
            </Stack>
          )}

          <Stack gap="sm" mt="sm">
            <FeatureLine icon={Film} text={t(`约 ${videoLimit} 个视频创作 / 月`)} />
            <FeatureLine icon={Clock} text={t('月付订阅，可按周期调整')} />
            <FeatureLine icon={Gift} text={t(`年付省 ${YEARLY_SAVINGS_PERCENT}%`)} />
            <FeatureLine icon={Mic} text={t('高级语音')} />
          </Stack>

          <Button
            component={Link}
            to={subscribeTo}
            state={subscribeState}
            fullWidth
            radius="xl"
            mt="auto"
            variant={highlighted ? 'filled' : 'default'}
            styles={{
              root: {
                background: highlighted ? '#ffffff' : 'rgb(255 255 255 / 6%)',
                border: '1px solid rgb(255 255 255 / 18%)',
                color: highlighted ? '#000000' : '#ffffff',
                fontWeight: 500,
              },
            }}
          >
            选择订阅
          </Button>
        </Stack>
      </Card>
    </motion.div>
  )
}

function PricingSkeletonGrid() {
  return (
    <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
      {Array.from({ length: 3 }).map((_, index) => (
        <Paper
          key={index}
          withBorder
          radius={20}
          p={28}
          h={320}
          style={elevatedSurfaceStyle}
        >
          <Stack gap="lg">
            <Skeleton height={26} width="36%" radius="xl" />
            <Skeleton height={52} width="58%" radius="xl" />
            <Skeleton height={18} radius="xl" />
            <Skeleton height={18} radius="xl" width="80%" />
            <Skeleton height={44} radius="xl" mt="xl" />
          </Stack>
        </Paper>
      ))}
    </SimpleGrid>
  )
}

function ComplianceSection() {
  const { ref, isInView } = useScrollAnimation()

  return (
    <Box component="section" id="compliance" py={{ base: 84, md: 124 }} style={sectionShellStyle}>
      <Box aria-hidden="true" style={sectionTopLineStyle} />
      <Container size="xl">
        <motion.div
          ref={ref as RefObject<HTMLDivElement>}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          variants={staggerContainer(0.1)}
        >
          <SectionHeading
            badge="合规边界"
            title="清楚说明产品能力，也清楚说明不可使用的场景"
            description="数字人口播使用你提供的人物照片和口播稿生成口播视频，不做第三方内容下载，不支持未经授权的冒充、换脸或 NSFW 内容。"
          />

          <motion.div variants={staggerContainer(0.14)}>
            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
              {complianceItems.map((item) => (
                <ComplianceCard key={item.title} {...item} />
              ))}
            </SimpleGrid>
          </motion.div>
        </motion.div>
      </Container>
    </Box>
  )
}

function ComplianceCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof ShieldCheck
  title: string
  description: string
}) {
  return (
    <motion.div variants={staggerItem}>
      <Paper
        withBorder
        radius={20}
        p={26}
        h="100%"
        style={{
          ...elevatedSurfaceStyle,
          minHeight: 210,
        }}
      >
        <Stack gap="lg" h="100%">
          <ThemeIcon
            size={46}
            radius="xl"
            variant="light"
            color="gray"
            styles={{ root: brandSoftIconStyles.root }}
          >
            <Icon width={22} height={22} />
          </ThemeIcon>
          <Stack gap={10} mt="auto">
            <Title order={3} size="h4" style={{ color: '#ffffff', letterSpacing: 0 }}>
              {title}
            </Title>
            <Text size="sm" lh={1.75} style={{ color: 'rgb(255 255 255 / 62%)' }}>
              {description}
            </Text>
          </Stack>
        </Stack>
      </Paper>
    </motion.div>
  )
}

function CTASection() {
  const { ref, isInView } = useScrollAnimation()

  return (
    <Box component="section" py={{ base: 84, md: 132 }} style={sectionShellStyle}>
      <Box aria-hidden="true" style={sectionTopLineStyle} />
      <Container size="md">
        <motion.div
          ref={ref as RefObject<HTMLDivElement>}
          initial="hidden"
          animate={isInView ? 'visible' : 'hidden'}
          variants={fadeInUp}
        >
          <Paper
            withBorder
            radius={32}
            p={{ base: 'xl', md: '3rem' }}
            ta="center"
            style={{
              background:
                'radial-gradient(circle at 50% 0%, rgb(224 122 69 / 18%), rgb(224 122 69 / 0%) 46%), linear-gradient(180deg, rgb(255 255 255 / 8%), rgb(255 255 255 / 3%))',
              borderColor: 'rgb(255 255 255 / 24%)',
              boxShadow: '0 32px 120px rgb(196 91 45 / 16%)',
              backdropFilter: 'blur(22px)',
            }}
          >
            <Stack gap="lg" align="center">
              <SectionPill label="启动创作" />
              <Title
                order={2}
                ta="center"
                style={{
                  fontSize: 'clamp(2rem, 5vw, 3.4rem)',
                  fontWeight: 500,
                  letterSpacing: 0,
                  lineHeight: 1.18,
                  color: '#ffffff',
                }}
              >
                用一张照片交付下一条口播视频
              </Title>
              <Text size="lg" maw={620} style={{ color: 'rgb(255 255 255 / 66%)' }}>
                准备好人物照片和中文稿件，把配音、三镜画面、字幕和合成交给数字人口播。
              </Text>
              <HeroActionButton label="免费注册开始创作" tone="light" />
            </Stack>
          </Paper>
        </motion.div>
      </Container>
    </Box>
  )
}

function SectionHeading({
  badge,
  title,
  description,
}: {
  badge: string
  title: string
  description: string
}) {
  return (
    <motion.div variants={fadeInUp}>
      <Stack align="center" ta="center" gap="md" mb={52}>
        <SectionPill label={badge} />
        <Title
          order={2}
          maw={760}
          style={{
            color: '#ffffff',
            fontSize: 'clamp(1.8rem, 4vw, 2.75rem)',
            fontWeight: 500,
            lineHeight: 1.22,
            letterSpacing: 0,
          }}
        >
          {title}
        </Title>
        <Text size="md" maw={720} lh={1.8} style={{ color: 'rgb(255 255 255 / 58%)' }}>
          {description}
        </Text>
      </Stack>
    </motion.div>
  )
}

function SectionPill({ label }: { label: string }) {
  return (
    <Paper
      radius="xl"
      px={12}
      py={6}
      style={{
        background: 'rgb(255 255 255 / 8%)',
        border: '1px solid rgb(255 255 255 / 18%)',
        boxShadow: '0 0 28px rgb(224 122 69 / 12%)',
      }}
    >
      <Group gap={7} wrap="nowrap">
        <Box
          aria-hidden="true"
          style={{
            width: 4,
            height: 4,
            borderRadius: 999,
            background: '#dbe7ff',
            boxShadow: '0 0 12px rgb(219 231 255 / 72%)',
          }}
        />
        <Text
          component="span"
          style={{
            color: '#dbe7ff',
            fontSize: 12,
            fontWeight: 600,
            lineHeight: 1,
          }}
        >
          {label}
        </Text>
      </Group>
    </Paper>
  )
}

function FeatureLine({
  icon: Icon,
  text,
}: {
  icon: typeof Zap
  text: string
}) {
  return (
    <Group gap="sm" wrap="nowrap">
      <ThemeIcon
        size={28}
        radius="xl"
        variant="light"
        color="gray"
        styles={{ root: brandSoftIconStyles.root }}
      >
        <Icon width={16} height={16} />
      </ThemeIcon>
      <Text style={{ color: 'rgb(255 255 255 / 62%)' }}>{text}</Text>
    </Group>
  )
}
