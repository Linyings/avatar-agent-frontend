import { Button, Center, Group, Stack, Text, Title } from '@mantine/core'
import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <Center component="main" mih="100vh" p="lg">
      <Stack align="center" gap="lg" maw={480} ta="center">
        <Text c="dimmed" fw={700}>404</Text>
        <Title order={1}>页面不存在</Title>
        <Text c="dimmed">
          请检查地址是否完整，或是否多复制了符号。你也可以从下方入口继续。
        </Text>
        <Group justify="center">
          <Button component={Link} to="/">返回新版首页</Button>
          <Button component={Link} to="/login" variant="default">登录账户</Button>
        </Group>
      </Stack>
    </Center>
  )
}
