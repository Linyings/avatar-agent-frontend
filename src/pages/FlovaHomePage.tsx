/**
 * FlovaHomePage — 高还原度克隆 flova.tv 首页
 * 特性：Cormorant Infant 艺术字体、多层径向光晕、浮动粒子动效、噪点纹理
 */
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ActionIcon, Box, Button, Group, Stack,
  Text, Textarea, Title, UnstyledButton,
} from '@mantine/core'
import { useAuth } from '@/features/auth'
import { T as tokens } from '@/theme/tokens'

/* ═══════════════════════════════════════════════════════════
   全局字体注入 (Cormorant Infant + Inter)
═══════════════════════════════════════════════════════════ */
const FONT_STYLE = `
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Infant:ital,wght@0,400;0,600;1,400;1,600;1,700&family=Inter:wght@300;400;500;600&display=swap');
  .flova-italic { font-family: 'Cormorant Infant', Georgia, serif; }
`

/* ═══════════════════════════════════════════════════════════
   设计 Token — 统一引用 src/theme/tokens.ts
   sideW/navH 保留本页特有尺寸（192/36），与全站布局变量不同
═══════════════════════════════════════════════════════════ */
const T = {
  ...tokens,
  card: tokens.surfaceRaised,
  sideW: 192,
  navH: 36,
} as const

/* ═══════════════════════════════════════════════════════════
   SVG 图标（内联，无依赖）
═══════════════════════════════════════════════════════════ */
function SvgIcon({ d, size = 15 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}
const HomeIcon    = () => <SvgIcon d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
const FolderIcon  = () => <SvgIcon d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
const SkillIcon   = () => <SvgIcon d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
const SparkIcon   = () => <SvgIcon d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
const LibraryIcon = () => <SvgIcon d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zm20 0h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
const PlayIcon    = () => <SvgIcon d="M23 7l-7 5 7 5V7zM1 5h15a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H1z" />
const BookIcon    = () => <SvgIcon d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
const TerminalIcon= () => <SvgIcon d="M4 17l6-6-6-6m8 14h8" />
const GiftIcon    = () => <SvgIcon d="M20 12v10H4V12M22 7H2v5h20V7zM12 22V7m0-5a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" />
const ShareIcon   = () => <SvgIcon d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
const SupportIcon = () => <SvgIcon d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
const PlusIcon    = () => <SvgIcon d="M12 5v14M5 12h14" size={14} />
const SettingIcon = () => <SvgIcon d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.07-3a7 7 0 0 0-.1-1.2l2.04-1.6-2-3.46-2.4.97a7 7 0 0 0-2.07-1.2L14 3h-4l-.54 2.51a7 7 0 0 0-2.07 1.2l-2.4-.97-2 3.46 2.04 1.6A7 7 0 0 0 5 12c0 .41.04.81.1 1.2L3.06 14.8l2 3.46 2.4-.97a7 7 0 0 0 2.07 1.2L10 21h4l.54-2.51a7 7 0 0 0 2.07-1.2l2.4.97 2-3.46-2.04-1.6A7 7 0 0 0 19.07 12z" size={14} />

/* ═══════════════════════════════════════════════════════════
   导航数据
═══════════════════════════════════════════════════════════ */
const NAV_MAIN = [
  { icon: HomeIcon,    label: '首页',    to: '/flova-home', active: true },
  { icon: FolderIcon,  label: '项目',    to: '/projects' },
  { icon: SkillIcon,   label: 'Skill',   to: '#' },
  { icon: SparkIcon,   label: '素材生成', to: '#' },
  { icon: LibraryIcon, label: '资产库',  to: '#' },
  { icon: PlayIcon,    label: 'FlovaTV', to: '#' },
]
const NAV_MID = [
  { icon: BookIcon,    label: '教程',    to: '#' },
  { icon: TerminalIcon,label: 'AS CLI', to: '#' },
]
const NAV_FOOT = [
  { icon: GiftIcon,    label: '邀请赢积分', to: '#' },
  { icon: ShareIcon,   label: '社交媒体',  to: '#' },
  { icon: SupportIcon, label: '客服与反馈', to: '#' },
]

/* ═══════════════════════════════════════════════════════════
   静态数据
═══════════════════════════════════════════════════════════ */
const SKILLS = ['角色资产', '剧情短片', '商业广告', '热门玩法', '音乐/MV', '游戏宣传片']

const TV_TABS = ['全部', '影视', '短剧', '漫剧', 'MV', 'TVC']
const TV_CARDS = [
  { tag: '短剧', title: '蛇借月',   author: '@Holly',       c1: '#180d26', c2: '#3a1656' },
  { tag: '影视', title: '星际漂流', author: '@司徒Sikang',  c1: '#0b1628', c2: '#182d52' },
  { tag: '漫剧', title: '霓虹都市', author: '@Mira',         c1: '#0f1a0e', c2: '#1c3818' },
  { tag: 'MV',   title: '浮生若梦', author: '@Yuna',         c1: '#1a0c0c', c2: '#3e1010' },
]

/* ═══════════════════════════════════════════════════════════
   浮动粒子动效 Canvas
═══════════════════════════════════════════════════════════ */
function ParticleCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId: number
    const W = canvas.offsetWidth
    const H = canvas.offsetHeight
    canvas.width = W
    canvas.height = H

    type P = { x: number; y: number; r: number; vx: number; vy: number; a: number; da: number }
    const particles: P[] = Array.from({ length: 55 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.4 + 0.3,
      vx: (Math.random() - 0.5) * 0.18,
      vy: (Math.random() - 0.5) * 0.18,
      a: Math.random(),
      da: (Math.random() - 0.5) * 0.004,
    }))

    const draw = () => {
      ctx.clearRect(0, 0, W, H)
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy; p.a += p.da
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0
        if (p.a < 0.05 || p.a > 0.85) p.da *= -1
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(255,255,255,${p.a * 0.45})`
        ctx.fill()
      }
      animId = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(animId)
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        opacity: 0.55,
      }}
    />
  )
}

/* ═══════════════════════════════════════════════════════════
   侧边栏导航项
═══════════════════════════════════════════════════════════ */
function NavItem({
  icon: Icon, label, active, onClick,
}: {
  icon: React.ComponentType; label: string; active?: boolean; onClick: () => void
}) {
  const [hov, setHov] = useState(false)
  return (
    <UnstyledButton
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '0 10px',
        height: T.navH,
        borderRadius: 7,
        background: active ? T.accentBg : hov ? T.surfaceHover : 'transparent',
        color: active ? T.accent : hov ? T.text : T.muted,
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        transition: 'background 130ms, color 130ms',
        cursor: 'pointer',
      }}
    >
      <Box style={{ width: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon />
      </Box>
      <Text size="sm" style={{ color: 'inherit', fontWeight: 'inherit', lineHeight: 1 }}>
        {label}
      </Text>
    </UnstyledButton>
  )
}

/* ═══════════════════════════════════════════════════════════
   左侧导航栏
═══════════════════════════════════════════════════════════ */
function Sidebar() {
  return (
    <Box
      style={{
        width: T.sideW,
        background: T.surface,
        borderRight: `1px solid ${T.border}`,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        height: '100%',
        overflowY: 'auto',
      }}
    >
      {/* Logo */}
      <Box style={{ padding: '15px 14px 13px', borderBottom: `1px solid ${T.border}` }}>
        <Group gap={9} wrap="nowrap">
          <Box
            style={{
              width: 24,
              height: 24,
              background: 'linear-gradient(135deg, #e8820a 0%, #ff5500 100%)',
              borderRadius: 7,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 14px rgba(232,130,10,0.5)',
            }}
          >
            <svg width={13} height={13} viewBox="0 0 24 24" fill="white">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </Box>
          <Text
            fw={700}
            size="sm"
            style={{
              color: T.text,
              letterSpacing: '-0.03em',
              fontFamily: "'Inter', sans-serif",
            }}
          >
            avatarSpeak
          </Text>
        </Group>
      </Box>

      {/* 主导航 */}
      <Stack gap={1} p="8px 6px 0">
        {NAV_MAIN.map((item) => (
          <NavItem key={item.label} icon={item.icon} label={item.label}
            active={item.active} onClick={() => { window.location.href = item.to }} />
        ))}
      </Stack>

      <Box style={{ flex: 1 }} />

      {/* 中部导航 */}
      <Stack gap={1} p="0 6px">
        {NAV_MID.map((item) => (
          <NavItem key={item.label} icon={item.icon} label={item.label} onClick={() => {}} />
        ))}
      </Stack>

      <Box style={{ height: 1, background: T.border, margin: '8px 14px' }} />

      {/* 底部导航 */}
      <Stack gap={1} p="0 6px 12px">
        {NAV_FOOT.map((item) => (
          <NavItem key={item.label} icon={item.icon} label={item.label} onClick={() => {}} />
        ))}
      </Stack>
    </Box>
  )
}

/* ═══════════════════════════════════════════════════════════
   顶部导航栏
═══════════════════════════════════════════════════════════ */
function TopNav() {
  const { isAuthenticated } = useAuth()
  return (
    <Box
      style={{
        height: 52,
        borderBottom: `1px solid ${T.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: '0 20px',
        gap: 10,
        flexShrink: 0,
        background: T.surface,
      }}
    >
      <Button
        size="xs"
        radius="xl"
        variant="outline"
        style={{
          borderColor: T.accentBorder,
          color: T.accent,
          background: T.accentBg,
          fontWeight: 600,
          height: 30,
          fontSize: 12,
          padding: '0 12px',
        }}
      >
        🔥 avatarSpeak 精选作者团招募中
      </Button>
      <Button
        component={Link}
        to={isAuthenticated ? '/dashboard' : '/register'}
        size="xs"
        radius="xl"
        style={{
          background: 'linear-gradient(90deg, #e8820a 0%, #ff6b00 100%)',
          color: '#fff',
          fontWeight: 600,
          height: 30,
          fontSize: 12,
          padding: '0 14px',
          border: 'none',
          boxShadow: '0 2px 12px rgba(232,130,10,0.4)',
        }}
      >
        🎁 注册领 300 积分
      </Button>
    </Box>
  )
}

/* ═══════════════════════════════════════════════════════════
   Hero 区域
═══════════════════════════════════════════════════════════ */
function HeroArea() {
  const [prompt, setPrompt] = useState('')
  const [activeSkill, setActiveSkill] = useState('热门玩法')

  return (
    <Box
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: T.bg,
        minHeight: 480,
      }}
    >
      {/* ── 背景层 1：深色渐变底 ── */}
      <Box
        style={{
          position: 'absolute',
          inset: 0,
          background: '#080808',
          zIndex: 0,
        }}
      />

      {/* ── 背景层 2：主光晕（橙色，中上方） ── */}
      <Box
        style={{
          position: 'absolute',
          top: '-18%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '90%',
          height: 560,
          borderRadius: '50%',
          background: 'radial-gradient(ellipse, rgba(232,130,10,0.22) 0%, rgba(200,100,0,0.09) 38%, transparent 68%)',
          filter: 'blur(18px)',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />

      {/* ── 背景层 3：暗紫色边缘晕 ── */}
      <Box
        style={{
          position: 'absolute',
          top: 0,
          left: '-10%',
          width: '50%',
          height: 400,
          background: 'radial-gradient(ellipse, rgba(100,40,160,0.10) 0%, transparent 65%)',
          filter: 'blur(30px)',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />
      <Box
        style={{
          position: 'absolute',
          top: 0,
          right: '-10%',
          width: '50%',
          height: 400,
          background: 'radial-gradient(ellipse, rgba(30,80,200,0.08) 0%, transparent 65%)',
          filter: 'blur(30px)',
          zIndex: 1,
          pointerEvents: 'none',
        }}
      />

      {/* ── 背景层 4：噪点纹理 ── */}
      <Box
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 2,
          pointerEvents: 'none',
          opacity: 0.032,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E")`,
          backgroundSize: '180px 180px',
        }}
      />

      {/* ── 背景层 5：粒子 ── */}
      <Box style={{ position: 'absolute', inset: 0, zIndex: 2, pointerEvents: 'none' }}>
        <ParticleCanvas />
      </Box>

      {/* ── 内容层 ── */}
      <Box style={{ position: 'relative', zIndex: 3, textAlign: 'center', padding: '56px 24px 40px' }}>

        {/* 主标题：Cormorant Infant 艺术字 */}
        <Box style={{ marginBottom: 10 }}>
          <Title
            order={1}
            style={{
              color: 'rgba(255,255,255,0.94)',
              fontSize: 'clamp(2.1rem,4.8vw,3.05rem)',
              fontWeight: 400,
              letterSpacing: '-0.01em',
              lineHeight: 1.18,
              display: 'inline',
            }}
          >
            <span
              style={{
                fontStyle: 'italic',
                fontWeight: 600,
                fontSize: '1.18em',
                background: 'linear-gradient(120deg, #ffb347 0%, #e8820a 40%, #ff6a00 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                letterSpacing: '-0.02em',
                marginRight: '0.2em',
              }}
            >
              avatarSpeak
            </span>
            你的专属AI数字人口播平台
          </Title>
        </Box>

        {/* 副标题 */}
        <Text
          size="md"
          style={{
            color: 'rgba(255,255,255,0.44)',
            fontWeight: 300,
            letterSpacing: '0.01em',
            marginBottom: 32,
          }}
        >
          灵活智能，一张照片即可生成口播成片
        </Text>

        {/* ── 创作输入框 ── */}
        <Box
          style={{
            maxWidth: 740,
            margin: '0 auto 22px',
            background: 'rgba(20,20,20,0.82)',
            border: `1px solid rgba(255,255,255,0.10)`,
            borderRadius: 16,
            overflow: 'hidden',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 4px 32px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06)',
            transition: 'border-color 200ms',
          }}
          onFocus={() => {}}
        >
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.currentTarget.value)}
            placeholder="由一个想法或故事开始..."
            minRows={3}
            maxRows={7}
            autosize
            styles={{
              input: {
                background: 'transparent',
                border: 'none',
                color: 'rgba(255,255,255,0.88)',
                fontSize: 15,
                fontWeight: 300,
                letterSpacing: '0.01em',
                lineHeight: 1.65,
                padding: '18px 18px 10px',
                resize: 'none',
                '&::placeholder': {
                  color: 'rgba(255,255,255,0.22)',
                  fontStyle: 'italic',
                },
              },
              wrapper: { background: 'transparent' },
            }}
          />

          {/* 工具栏 */}
          <Group
            justify="space-between"
            px={12}
            py={8}
            style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}
          >
            <Group gap={4} wrap="nowrap">
              {/* + 添加 */}
              <ActionIcon
                variant="subtle"
                size={30}
                radius={7}
                title="添加素材"
                style={{ color: T.muted }}
              >
                <PlusIcon />
              </ActionIcon>
              {/* 设置 */}
              <ActionIcon
                variant="subtle"
                size={30}
                radius={7}
                title="高级设置"
                style={{ color: T.muted }}
              >
                <SettingIcon />
              </ActionIcon>
              {/* 必要时询问 pill */}
              <Box
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '3px 10px 3px 8px',
                  borderRadius: 999,
                  border: `1px solid ${T.accentBorder}`,
                  background: T.accentBg,
                  cursor: 'pointer',
                }}
              >
                <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth={2.2}>
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
                <Text style={{ color: T.accent, fontSize: 12, fontWeight: 500 }}>
                  必要时询问
                </Text>
              </Box>
            </Group>

            {/* 生成按钮 */}
            <Button
              onClick={() => { window.location.href = '/' }}
              size="sm"
              radius="xl"
              disabled={!prompt.trim()}
              style={{
                height: 32,
                padding: '0 18px',
                fontSize: 13,
                fontWeight: 600,
                background: prompt.trim()
                  ? 'linear-gradient(90deg, #e8820a 0%, #ff6a00 100%)'
                  : 'rgba(255,255,255,0.08)',
                border: 'none',
                color: prompt.trim() ? '#fff' : T.dim,
                boxShadow: prompt.trim() ? '0 2px 14px rgba(232,130,10,0.4)' : 'none',
                transition: 'all 180ms ease',
              }}
            >
              生成 →
            </Button>
          </Group>
        </Box>

        {/* ── Skills 标签 ── */}
        <Group justify="center" gap={7} wrap="wrap">
          <Text
            size="xs"
            style={{ color: T.dim, whiteSpace: 'nowrap' }}
          >
            精选 Skills:
          </Text>
          {SKILLS.map((s) => {
            const isActive = s === activeSkill
            return (
              <UnstyledButton
                key={s}
                onClick={() => setActiveSkill(s)}
                style={{
                  padding: '4px 13px',
                  borderRadius: 999,
                  border: `1px solid ${isActive ? T.accentBorder : 'rgba(255,255,255,0.10)'}`,
                  color: isActive ? T.accent : 'rgba(255,255,255,0.46)',
                  background: isActive ? T.accentBg : 'transparent',
                  fontSize: 12.5,
                  fontWeight: isActive ? 600 : 400,
                  cursor: 'pointer',
                  transition: 'all 130ms',
                  backdropFilter: 'blur(8px)',
                }}
              >
                {s}
              </UnstyledButton>
            )
          })}
        </Group>
      </Box>

      {/* FlovaTV 区 */}
      <FlovaTV />
    </Box>
  )
}

/* ═══════════════════════════════════════════════════════════
   FlovaTV 视频展示区
═══════════════════════════════════════════════════════════ */
function FlovaTV() {
  const [activeTab, setActiveTab] = useState('全部')

  return (
    <Box
      style={{
        padding: '32px 28px 48px',
        borderTop: `1px solid ${T.border}`,
        position: 'relative',
        zIndex: 3,
      }}
    >
      {/* 标题行 */}
      <Group justify="space-between" mb={20} wrap="wrap" gap={10}>
        <Text
          fw={700}
          size="lg"
          style={{ color: T.text, letterSpacing: '-0.02em' }}
        >
          FlovaTV
        </Text>
        <Group gap={6} wrap="wrap">
          {TV_TABS.map((tab) => (
            <UnstyledButton
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '5px 16px',
                borderRadius: 999,
                background: activeTab === tab ? '#ffffff' : 'transparent',
                color: activeTab === tab ? '#000000' : T.muted,
                fontSize: 13,
                fontWeight: activeTab === tab ? 600 : 400,
                border: `1px solid ${activeTab === tab ? '#ffffff' : T.border}`,
                transition: 'all 130ms',
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
          gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
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
  tag, title, author, c1, c2,
}: {
  tag: string; title: string; author: string; c1: string; c2: string
}) {
  const [hov, setHov] = useState(false)

  return (
    <Box
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        borderRadius: 12,
        overflow: 'hidden',
        background: T.card,
        border: `1px solid ${hov ? T.borderHover : T.border}`,
        cursor: 'pointer',
        transition: 'border-color 160ms, transform 200ms',
        transform: hov ? 'translateY(-3px)' : 'none',
        boxShadow: hov ? '0 8px 32px rgba(0,0,0,0.45)' : '0 2px 8px rgba(0,0,0,0.2)',
      }}
    >
      {/* 缩略图 */}
      <Box
        style={{
          aspectRatio: '9/14',
          background: `linear-gradient(150deg, ${c1} 0%, ${c2} 100%)`,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 10,
        }}
      >
        {/* 品牌角标 */}
        <Group justify="space-between" align="flex-start">
          <Box
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.55)',
              letterSpacing: '0.04em',
              background: 'rgba(0,0,0,0.3)',
              padding: '2px 7px',
              borderRadius: 4,
              backdropFilter: 'blur(6px)',
            }}
          >
            avatarSpeak
          </Box>
          <Box
            style={{
              fontSize: 11,
              color: 'rgba(255,255,255,0.7)',
              background: 'rgba(0,0,0,0.4)',
              padding: '2px 8px',
              borderRadius: 4,
              backdropFilter: 'blur(6px)',
            }}
          >
            {tag}
          </Box>
        </Group>

        {/* 标题文字（用 Cormorant Infant 艺术字） */}
        <Box>
          <Text
            style={{
              fontFamily: "'Cormorant Infant', Georgia, serif",
              fontStyle: 'italic',
              fontWeight: 600,
              fontSize: 26,
              color: 'rgba(255,255,255,0.88)',
              lineHeight: 1.1,
              textShadow: '0 2px 12px rgba(0,0,0,0.6)',
              letterSpacing: '-0.01em',
            }}
          >
            {title}
          </Text>
        </Box>

        {/* 悬停播放按钮 */}
        {hov && (
          <Box
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.22)',
            }}
          >
            <Box
              style={{
                width: 48,
                height: 48,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.15)',
                border: '1.5px solid rgba(255,255,255,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                backdropFilter: 'blur(8px)',
                boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
              }}
            >
              <svg width={18} height={18} viewBox="0 0 24 24" fill="white">
                <path d="M5 3l14 9-14 9V3z" />
              </svg>
            </Box>
          </Box>
        )}
      </Box>

      {/* 卡片底部信息 */}
      <Box style={{ padding: '10px 12px 12px' }}>
        <Text
          size="sm"
          fw={500}
          style={{ color: T.text, letterSpacing: '-0.01em' }}
          lineClamp={1}
        >
          {title}
        </Text>
        <Text size="xs" style={{ color: T.muted, marginTop: 3 }}>
          {author}
        </Text>
      </Box>
    </Box>
  )
}

/* ═══════════════════════════════════════════════════════════
   主页组件
═══════════════════════════════════════════════════════════ */
export default function FlovaHomePage() {
  // 注入 Google Fonts + 强制根节点全高
  useEffect(() => {
    const fontId = 'flova-fonts'
    if (!document.getElementById(fontId)) {
      const style = document.createElement('style')
      style.id = fontId
      style.textContent = FONT_STYLE
      document.head.appendChild(style)
    }
    // 强制 html/body/root 全高深色
    const prev = {
      html: document.documentElement.style.cssText,
      body: document.body.style.cssText,
    }
    document.documentElement.style.cssText = 'height:100%;background:#080808;'
    document.body.style.cssText = 'height:100%;margin:0;background:#080808;overflow:hidden;'
    const root = document.getElementById('root')
    const prevRoot = root?.style.cssText ?? ''
    if (root) root.style.cssText = 'height:100%;display:flex;flex-direction:column;'

    return () => {
      document.getElementById(fontId)?.remove()
      document.documentElement.style.cssText = prev.html
      document.body.style.cssText = prev.body
      if (root) root.style.cssText = prevRoot
    }
  }, [])

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100vh',
        background: T.bg,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Sidebar />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }}>
          <TopNav />
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
            <HeroArea />
          </div>
        </div>
      </div>
    </div>
  )
}
