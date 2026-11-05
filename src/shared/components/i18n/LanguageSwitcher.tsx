import { ActionIcon, Group, Menu, Select, Stack, Text, UnstyledButton } from '@mantine/core'
import { ChevronDownIcon, GlobeIcon } from '@/shared/icons/tabler'
import { localeLabels, localeSelectData } from '@/shared/i18n/locales'
import { useI18n } from '@/shared/i18n/I18nProvider'
import type { Locale } from '@/shared/i18n/locales'

interface LanguageSwitcherProps {
  compact?: boolean
  tone?: 'default' | 'inverse'
  variant?: 'select' | 'icon' | 'row'
}

const compactLocaleLabels: Record<Locale, string> = {
  en: 'ENGLISH',
  fr: 'FRANCAIS',
  de: 'DEUTSCH',
  'zh-CN': '中文',
}

const heroLocaleOrder: Locale[] = ['zh-CN', 'en', 'fr', 'de']

export default function LanguageSwitcher({
  compact = false,
  tone = 'default',
  variant = 'select',
}: LanguageSwitcherProps) {
  const { locale, setLocale } = useI18n()
  const isInverse = tone === 'inverse'

  if (variant === 'row') {
    return (
      <Menu shadow="xl" width={180} position="right-start" offset={10} withinPortal>
        <Menu.Target>
          <UnstyledButton
            aria-label="语言"
            data-i18n-skip
            style={{
              width: '100%',
              minHeight: 46,
              display: 'flex',
              alignItems: 'center',
              justifyContent: compact ? 'center' : 'space-between',
              gap: 12,
              padding: compact ? 0 : '10px 12px',
              borderRadius: 'var(--mantine-radius-sm)',
              color: 'var(--app-nav-text)',
              transition: 'background-color var(--app-transition), color var(--app-transition)',
            }}
          >
            <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
              <GlobeIcon width={24} height={24} stroke={1.5} />
              {!compact ? (
                <Text size="sm" fw={500} truncate>
                  {localeLabels[locale]}
                </Text>
              ) : null}
            </Group>
            {!compact ? <ChevronDownIcon width={16} height={16} stroke={1.7} /> : null}
          </UnstyledButton>
        </Menu.Target>

        <Menu.Dropdown>
          {heroLocaleOrder.map((value) => (
            <Menu.Item key={value} onClick={() => setLocale(value)}>
              {localeLabels[value]}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    )
  }

  if (variant === 'icon') {
    return (
      <Menu shadow="xl" width={180} position="bottom-end" offset={10} withinPortal={false}>
        <Menu.Target>
          <ActionIcon
            aria-label={localeLabels[locale]}
            data-i18n-skip
            size={compact ? 40 : 44}
            radius="xl"
            variant="subtle"
            styles={{
              root: {
                background: 'transparent',
                border: 'none',
                color: isInverse ? 'rgb(255 255 255 / 78%)' : 'var(--app-muted)',
                boxShadow: 'none',
                transition: 'background 160ms ease, color 160ms ease',
                '&:hover': {
                  background: isInverse ? 'rgb(255 255 255 / 8%)' : 'var(--app-surface)',
                  color: isInverse ? '#ffffff' : 'var(--app-text)',
                },
              },
            }}
          >
            <GlobeIcon size={20} stroke={1.8} />
          </ActionIcon>
        </Menu.Target>

        <Menu.Dropdown
          data-i18n-skip
          style={{
            padding: 14,
            borderRadius: 12,
            background: 'rgb(4 5 8 / 98%)',
            border: '1px solid rgb(255 255 255 / 16%)',
            boxShadow: '0 24px 70px rgb(0 0 0 / 46%)',
            backdropFilter: 'blur(18px)',
            zIndex: 10,
          }}
        >
          <Stack gap={12}>
            {heroLocaleOrder.map((value) => {
              const selected = value === locale

              return (
                <Menu.Item
                  key={value}
                  onClick={() => setLocale(value)}
                  styles={{
                    item: {
                      padding: 0,
                      minHeight: 28,
                      color: selected ? '#ffffff' : 'rgb(255 255 255 / 56%)',
                      background: 'transparent',
                      '&:hover': {
                        background: 'transparent',
                        color: '#ffffff',
                      },
                    },
                  }}
                >
                  <Text
                    size="sm"
                    fw={selected ? 600 : 500}
                    style={{
                      letterSpacing: selected ? 0 : 0.8,
                      lineHeight: 1,
                    }}
                  >
                    {compactLocaleLabels[value]}
                  </Text>
                </Menu.Item>
              )
            })}
          </Stack>
        </Menu.Dropdown>
      </Menu>
    )
  }

  return (
    <Select
      aria-label="Language"
      data-i18n-skip
      data={localeSelectData}
      value={locale}
      onChange={(value) => value && setLocale(value as Locale)}
      allowDeselect={false}
      checkIconPosition="right"
      comboboxProps={{ withinPortal: false }}
      w={compact ? 112 : 140}
      size="xs"
      styles={{
        input: {
          minHeight: compact ? 38 : 34,
          height: compact ? 38 : 34,
          borderRadius: 999,
          background: isInverse ? 'rgb(255 255 255 / 10%)' : 'rgba(255, 255, 255, 0.92)',
          borderColor: isInverse ? 'rgb(255 255 255 / 18%)' : 'rgba(15, 23, 42, 0.14)',
          color: isInverse ? '#ffffff' : '#111827',
          fontWeight: 600,
          boxShadow: isInverse
            ? 'inset 0 1px 0 rgb(255 255 255 / 12%), 0 10px 26px rgb(0 0 0 / 18%)'
            : '0 10px 26px rgba(0, 0, 0, 0.18)',
          backdropFilter: isInverse ? 'blur(14px)' : undefined,
          transition: 'background 160ms ease, border-color 160ms ease, color 160ms ease',
          '&:hover': {
            background: isInverse ? 'rgb(255 255 255 / 14%)' : undefined,
            borderColor: isInverse ? 'rgb(255 255 255 / 28%)' : undefined,
          },
        },
        section: {
          color: isInverse ? 'rgb(255 255 255 / 72%)' : '#64748b',
        },
        dropdown: {
          borderRadius: 12,
          background: 'rgba(255, 255, 255, 0.96)',
          borderColor: 'rgba(15, 23, 42, 0.12)',
          boxShadow: '0 18px 42px rgba(0, 0, 0, 0.22)',
          backdropFilter: 'blur(14px)',
        },
        option: {
          color: '#111827',
          fontWeight: 600,
        },
      }}
    />
  )
}
