import { Link } from 'react-router-dom'
import { Anchor, Box, Container, Divider, Grid, Group, Stack, Text } from '@mantine/core'
import BrandLockup from '@/shared/components/brand/BrandLockup'
import { getVersion } from '@/shared/utils/version'

export default function Footer() {
  const currentYear = new Date().getFullYear()
  const version = getVersion()

  return (
    <Box
      component="footer"
      py={72}
      style={{
        background:
          'radial-gradient(circle at 50% 0%, rgb(224 122 69 / 16%), rgb(224 122 69 / 0%) 32%), linear-gradient(180deg, #000000 0%, #120e0c 100%)',
        borderTop: '1px solid rgb(255 255 255 / 12%)',
        color: '#ffffff',
      }}
    >
      <Container size="xl">
        <Grid mb={48}>
          <Grid.Col span={{ base: 12, md: 5 }}>
            <Stack gap="md">
              <BrandLockup markSize={40} size={22} tone="dark" />
              <Text maw={420} lh={1.7} style={{ color: 'rgb(255 255 255 / 60%)' }}>
                用一张人物照片和一段中文口播稿，生成配音、多角度画面、字幕和可下载的竖屏视频。
              </Text>
            </Stack>
          </Grid.Col>

          <Grid.Col span={{ base: 6, md: 3 }}>
            <FooterColumn
              title="产品"
              items={[
                { label: '功能特性', to: '/#features' },
                { label: '额度方案', to: '/#pricing' },
                { label: '项目工作台', to: '/projects' },
                { label: '控制台', to: '/dashboard' },
              ]}
            />
          </Grid.Col>

          <Grid.Col span={{ base: 6, md: 3 }}>
            <FooterColumn
              title="资源"
              items={[
                { to: '/resources', label: 'AI Workflows' },
                { to: '/privacy-policy', label: '隐私政策' },
                { to: '/terms-of-service', label: '服务条款' },
              ]}
            />
          </Grid.Col>
        </Grid>

        <Divider color="rgb(255 255 255 / 12%)" mb="lg" />

        <Group justify="space-between" align="center" gap="md">
          <Group gap="md">
            <Text size="sm" style={{ color: 'rgb(255 255 255 / 48%)' }}>
              © {currentYear} 数字人口播。保留所有权利。
            </Text>
            <Anchor component={Link} to="/privacy-policy" c="dimmed" underline="never">
              隐私政策
            </Anchor>
            <Anchor component={Link} to="/terms-of-service" c="dimmed" underline="never">
              服务条款
            </Anchor>
          </Group>
          <Text size="sm" c="dimmed">{version}</Text>
        </Group>
      </Container>
    </Box>
  )
}

function FooterColumn({
  items,
  title,
}: {
  items: Array<{ href?: string; label: string; to?: string }>
  title: string
}) {
  return (
    <Stack gap="sm">
      <Text size="xs" fw={700} style={{ color: 'rgb(255 255 255 / 50%)', letterSpacing: 0 }}>
        {title}
      </Text>
      {items.map((item) => (
        item.to ? (
          <Anchor key={item.label} component={Link} to={item.to} c="dimmed" underline="never">
            {item.label}
          </Anchor>
        ) : (
          <Anchor
            key={item.label}
            href={item.href}
            c="dimmed"
            underline="never"
          >
            {item.label}
          </Anchor>
        )
      ))}
    </Stack>
  )
}

