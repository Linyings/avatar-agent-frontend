/**
 * FlovaHomePage — 仿 flova.tv 首页 UI
 * 深色主题，左侧导航 + 顶部促销横幅 + Hero 创作区 + FlovaTV 展示区
 */
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  ScrollArea,
  Stack,
  Text,
  Textarea,
  Title,
  UnstyledButton,
} from '@mantine/core'
import { useAuth } from '@/features/auth'

// ─── 色彩 token ──────────────────────────────────────────────
const C = {
  bg: '#0d0d0d',
  surface: '#161616',
  surfaceHover: '#1f1f1f',
  border: 'rgb(255 255 255 / 8%)',
  borderHover: 'rgb(255 255 255 / 16%)',
  text: 'rgb(255 255 255 / 90%)',
  muted: 'rgb(255 255 255 / 45%)',
  dim: 'rgb(255 255 255 / 28%)',
  accent: '#e07a00',         // 橙色主色
  accentMid: '#c86c00',
  accentBg: 'rgb(224 122 0 / 14%)',
  accentBorder: 'rgb(224 122 0 / 36%)',
  heroBg: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgb(224 122 0 / 18%), transparent 70%), #0d0d0d',
  sidebarW: 200,
  topBarH: 40,
  navItemH: 36,
} as const

// ─── 导航数据 ────────────────────────────────────────────────
const NAV_MAIN = [
  { icon: '⊞', label: '首页',    to: '/flova-home', active: true  },
  { icon: '◫', label: '项目',    to: '/projects'                  },
  { icon: '◈', label: 'Skill',   to: '#'                          },
  { icon: '✦', label: '素材生成', to: '#'                          },
  { icon: '▤', label: '资产库',  to: '#'                          },
  { icon: '▷', label: 'FlovaTV', to: '#'                          },
]
const NAV_BOTTOM = [
  { icon: '◎', label: '教程',    to: '#' },
  { icon: '⌘', label: 'Flova CLI', to: '#' },
]
const NAV_FOOT = [
  { icon: '🎁', label: '邀请赢积分', to: '#' },
  { icon: '◻', label: '社交媒体',  to: '#' },
  { icon: '⊙', label: '客服与反馈', to: '#' },
]

// ─── Skills 标签 ─────────────────────────────────────────────
const SKILLS = ['角色资产', '剧情短片', '商业广告', '热门玩法', '音乐/MV', '游戏宣传片']

// ─── FlovaTV 假数据 ───────────────────────────────────────────
const FLOVA_TV_TABS = ['全部', '影视', '短剧', '漫剧', 'MV', 'TVC']
const TV_CARDS = [
  { tag: '短剧', title: '蛇借月', sub: '@Holly',       gradient: 'linear-gradient(135deg,#1a0a1e,#3d1a4a)' },
  { tag: '影视', title: '星际漂流', sub: '@司徒Sikang', gradient: 'linear-gradient(135deg,#0a1220,#1a2d4a)' },
  { tag: '漫剧', title: '霓虹都市', sub: '@Mira',       gradient: 'linear-gradient(135deg,#0f1a0a,#1e3a10)' },
  { tag: 'MV',   title: '浮生若梦', sub: '@Yuna',       gradient: 'linear-gradient(135deg,#1a0a0a,#4a1010)' },
]

// ─── 顶部促销横幅 ─────────────────────────────────────────────
function TopBar({ onClose }: { onClose: () => void }) {
  const [time, setTime] = useState({ h: 25, m: 2, s: 55 })
  return (
    <Box
      style={{
        height: C.topBarH,
        background: 'linear-gradient(90deg,#c62a2a,#e07a00,#2a7ac6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        position: 'relative',
        flexShrink: 0,
      }}
    >
      <Text size="sm" fw={500} style={{ color: '#fff', whiteSpace: 'nowrap' }}>
        双11狂欢 | Pro年卡买1送1 Seedance 2.5限时1.5折优惠，720p低至¥0.175/秒
      </Text>
      <Group gap={4} wrap="nowrap">
        {[time.h, time.m, time.s].map((v, i) => (
          <Group key={i} gap={4} wrap="nowrap">
            <Box style={{
              background: 'rgb(0 0 0 / 40%)',
              borderRadius: 4,
              padding: '1px 6px',
              color: '#fff',
              fontSize: 13,
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
              minWidth: 26,
              textAlign: 'center',
            }}>
              {String(v).padStart(2, '0')}
            </Box>
            {i < 2 && <Text size="xs" fw={700} c="#fff">:</Text>}
          </Group>
        ))}
      </Group>
      <Button
        size="xs"
        radius="xl"
        style={{
          background: 'rgb(255 255 255 / 20%)',
          border: '1px solid rgb(255 255 255 / 40%)',
          color: '#fff',
          fontWeight: 600,
          height: 28,
          padding: '0 12px',
        }}
      >
        立即抢购 →
      </Button>
      <ActionIcon
        variant="transparent"
        onClick={onClose}
        style={{ position: 'absolute', right: 12, color: 'rgb(255 255 255 / 70%)' }}
        size="sm"
      >
        ✕
      </ActionIcon>
    </Box>
  )
}

// ─── 左侧导航 ─────────────────────────────────────────────────
function Sidebar() {
  const navigate = useNavigate()
  return (
    <Box
      style={{
        width: C.sidebarW,
        background: C.surface,
        borderRight: `1px solid ${C.border}`,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        height: '100%',
        overflowY: 'auto',
      }}
    >
      {/* Logo */}
      <Box
        style={{
          padding: '16px 16px 12px',
          borderBottom: `1px solid ${C.border}`,
        }}
      >
        <Group gap={8} wrap="nowrap">
          <Box
            style={{
              width: 22,
              height: 22,
              background: 'linear-gradient(135deg,#e07a00,#ff4500)',
              borderRadius: 6,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              fontSize: 12,
              fontWeight: 900,
            }}
          >
            ✦
          </Box>
          <Text fw={700} size="sm" style={{ color: C.text, letterSpacing: '-0.02em' }}>
            avatarSpeak
          </Text>
        </Group>
      </Box>

      {/* 主导航 */}
      <Stack gap={2} p="8px 8px 0">
        {NAV_MAIN.map((item) => (
          <NavItem key={item.label} {...item} onClick={() => navigate(item.to)} />
        ))}
      </Stack>

      <Box style={{ flex: 1 }} />

      {/* 底部导航 */}
      <Stack gap={2} p="0 8px">
        {NAV_BOTTOM.map((item) => (
          <NavItem key={item.label} {...item} onClick={() => navigate(item.to)} />
        ))}
      </Stack>

      {/* 分割线 */}
      <Box style={{ height: 1, background: C.border, margin: '8px 16px' }} />

      {/* 最底部 */}
      <Stack gap={2} p="0 8px 12px">
        {NAV_FOOT.map((item) => (
          <NavItem key={item.label} {...item} onClick={() => {}} />
        ))}
      </Stack>
    </Box>
  )
}

function NavItem({
  icon, label, active, onClick,
}: {
  icon: string; label: string; active?: boolean; onClick: () => void
}) {
  return (
    <UnstyledButton
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '0 10px',
        height: C.navItemH,
        borderRadius: 8,
        background: active ? C.accentBg : 'transparent',
        color: active ? '#e07a00' : C.muted,
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        transition: 'background 120ms, color 120ms',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.background = C.surfaceHover
          ;(e.currentTarget as HTMLButtonElement).style.color = C.text
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
          ;(e.currentTarget as HTMLButtonElement).style.color = C.muted
        }
      }}
    >
      <Text style={{ fontSize: 14, lineHeight: 1, width: 16, textAlign: 'center' }}>
        {icon}
      </Text>
      <Text size="sm" style={{ color: 'inherit', fontWeight: 'inherit' }}>
        {label}
      </Text>
    </UnstyledButton>
  )
}

// ─── 顶部导航栏 ───────────────────────────────────────────────
function TopNav() {
  const { isAuthenticated } = useAuth()
  return (
    <Box
      style={{
        height: 52,
        borderBottom: `1px solid ${C.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: '0 20px',
        gap: 10,
        flexShrink: 0,
        background: C.surface,
      }}
    >
      <Button
        size="xs"
        radius="xl"
        variant="outline"
        style={{
          borderColor: C.accentBorder,
          color: '#e07a00',
          background: C.accentBg,
          fontWeight: 600,
          height: 30,
        }}
      >
        🔥 Flova 精选作者团招募中
      </Button>
      <Button
        component={Link}
        to={isAuthenticated ? '/dashboard' : '/register'}
        size="xs"
        radius="xl"
        style={{
          background: 'linear-gradient(90deg,#e07a00,#ff6b00)',
          color: '#fff',
          fontWeight: 600,
          height: 30,
          border: 'none',
        }}
      >
        🎁 注册领 300 积分
      </Button>
    </Box>
  )
}

// ─── Hero 区域 ────────────────────────────────────────────────
function HeroArea() {
  const [prompt, setPrompt] = useState('')
  const navigate = useNavigate()

  return (
    <Box
      style={{
        flex: 1,
        minHeight: 0,
        overflow: 'auto',
        background: C.bg,
      }}
    >
      {/* Hero 标题区 */}
      <Box
        style={{
          textAlign: 'center',
          padding: '52px 24px 32px',
          background: C.heroBg,
        }}
      >
        <Title
          order={1}
          style={{
            color: C.text,
            fontSize: 'clamp(2rem,5vw,3rem)',
            fontWeight: 500,
            letterSpacing: '-0.03em',
            lineHeight: 1.2,
            marginBottom: 8,
          }}
        >
          <Text
            component="span"
            style={{
              fontStyle: 'italic',
              fontWeight: 700,
              fontSize: '1em',
              background: 'linear-gradient(90deg,#e07a00,#ff9d00)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            avatarSpeak
          </Text>{' '}
          你的专属AI数字人口播平台
        </Title>
        <Text
          size="md"
          style={{ color: C.muted, marginBottom: 28 }}
        >
          灵活智能，创意自在成片
        </Text>

        {/* 输入框 */}
        <Box
          style={{
            maxWidth: 720,
            margin: '0 auto',
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 16,
            overflow: 'hidden',
          }}
        >
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.currentTarget.value)}
            placeholder="由一个想法或故事开始..."
            minRows={3}
            maxRows={6}
            autosize
            styles={{
              input: {
                background: 'transparent',
                border: 'none',
                color: C.text,
                fontSize: 15,
                padding: '16px 16px 8px',
                resize: 'none',
                '&::placeholder': { color: C.dim },
              },
              wrapper: { background: 'transparent' },
            }}
          />
          {/* 工具栏 */}
          <Group
            justify="space-between"
            p="8px 12px"
            style={{ borderTop: `1px solid ${C.border}` }}
          >
            <Group gap={8} wrap="nowrap">
              <ActionIcon
                variant="subtle"
                style={{ color: C.muted }}
                size="sm"
                title="添加素材"
              >
                +
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                style={{ color: C.muted }}
                size="sm"
                title="设置"
              >
                ⚙
              </ActionIcon>
              <Badge
                size="sm"
                radius="xl"
                style={{
                  background: C.accentBg,
                  border: `1px solid ${C.accentBorder}`,
                  color: '#e07a00',
                  cursor: 'pointer',
                }}
              >
                ✦ 必要时询问
              </Badge>
            </Group>
            <Button
              size="sm"
              radius="xl"
              disabled={!prompt.trim()}
              onClick={() => navigate('/avatar-mvp')}
              style={{
                background: prompt.trim()
                  ? 'linear-gradient(90deg,#e07a00,#ff6b00)'
                  : C.surfaceHover,
                border: 'none',
                color: prompt.trim() ? '#fff' : C.dim,
                fontWeight: 600,
                height: 32,
                padding: '0 16px',
                transition: 'all 160ms',
              }}
            >
              生成 →
            </Button>
          </Group>
        </Box>

        {/* Skills 标签栏 */}
        <Group justify="center" gap={8} mt={20} wrap="wrap">
          <Text size="xs" style={{ color: C.dim }}>精选 Skills:</Text>
          {SKILLS.map((s, i) => (
            <UnstyledButton
              key={s}
              style={{
                padding: '4px 12px',
                borderRadius: 999,
                border: `1px solid ${i === 3 ? C.accentBorder : C.border}`,
                color: i === 3 ? '#e07a00' : C.muted,
                background: i === 3 ? C.accentBg : 'transparent',
                fontSize: 13,
                cursor: 'pointer',
                transition: 'all 120ms',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.borderColor = C.accentBorder
                ;(e.currentTarget as HTMLButtonElement).style.color = '#e07a00'
              }}
              onMouseLeave={(e) => {
                if (i !== 3) {
                  (e.currentTarget as HTMLButtonElement).style.borderColor = C.border
                  ;(e.currentTarget as HTMLButtonElement).style.color = C.muted
                }
              }}
            >
              {s}
            </UnstyledButton>
          ))}
        </Group>
      </Box>

      {/* FlovaTV 区域 */}
      <FlovaTV />
    </Box>
  )
}

// ─── FlovaTV ──────────────────────────────────────────────────
function FlovaTV() {
  const [activeTab, setActiveTab] = useState('全部')

  return (
    <Box style={{ padding: '24px 24px 40px' }}>
      {/* 标题 + 分类 */}
      <Group justify="space-between" mb={16} wrap="wrap" gap={8}>
        <Text fw={700} size="lg" style={{ color: C.text }}>
          FlovaTV
        </Text>
        <Group gap={6} wrap="wrap">
          {FLOVA_TV_TABS.map((tab) => (
            <UnstyledButton
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '4px 14px',
                borderRadius: 999,
                background: activeTab === tab ? '#fff' : 'transparent',
                color: activeTab === tab ? '#000' : C.muted,
                fontSize: 13,
                fontWeight: activeTab === tab ? 600 : 400,
                border: `1px solid ${activeTab === tab ? '#fff' : C.border}`,
                transition: 'all 120ms',
                cursor: 'pointer',
              }}
            >
              {tab}
            </UnstyledButton>
          ))}
        </Group>
      </Group>

      {/* 视频卡片网格 */}
      <Box
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 16,
        }}
      >
        {TV_CARDS.map((card, i) => (
          <TVCard key={i} {...card} />
        ))}
      </Box>
    </Box>
  )
}

function TVCard({
  tag, title, sub, gradient,
}: {
  tag: string; title: string; sub: string; gradient: string
}) {
  const [hover, setHover] = useState(false)
  return (
    <Box
      style={{
        borderRadius: 12,
        overflow: 'hidden',
        background: C.surface,
        border: `1px solid ${hover ? C.borderHover : C.border}`,
        cursor: 'pointer',
        transition: 'border-color 160ms, transform 160ms',
        transform: hover ? 'translateY(-2px)' : 'none',
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* 视频缩略图占位 */}
      <Box
        style={{
          aspectRatio: '9/16',
          maxHeight: 320,
          background: gradient,
          display: 'flex',
          alignItems: 'flex-start',
          padding: 10,
          position: 'relative',
        }}
      >
        <Badge
          size="xs"
          radius="sm"
          style={{
            background: 'rgb(0 0 0 / 50%)',
            color: '#fff',
            border: 'none',
            backdropFilter: 'blur(4px)',
          }}
        >
          {tag}
        </Badge>
        {hover && (
          <Box
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Box
              style={{
                width: 44,
                height: 44,
                borderRadius: '50%',
                background: 'rgb(0 0 0 / 50%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 18,
              }}
            >
              ▶
            </Box>
          </Box>
        )}
      </Box>
      {/* 卡片信息 */}
      <Box style={{ padding: '10px 12px 12px' }}>
        <Text size="sm" fw={600} style={{ color: C.text }} lineClamp={1}>
          {title}
        </Text>
        <Text size="xs" style={{ color: C.muted }} mt={2}>
          {sub}
        </Text>
      </Box>
    </Box>
  )
}

// ─── 主页组件 ─────────────────────────────────────────────────
export default function FlovaHomePage() {
  return (
    <Box
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        background: C.bg,
        overflow: 'hidden',
      }}
    >
      <Box style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        <Sidebar />
        <Box style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <TopNav />
          <ScrollArea style={{ flex: 1 }} offsetScrollbars>
            <HeroArea />
          </ScrollArea>
        </Box>
      </Box>
    </Box>
  )
}
