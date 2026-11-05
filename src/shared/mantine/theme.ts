import {
  Accordion,
  ActionIcon,
  Alert,
  AppShell,
  Badge,
  Button,
  Card,
  Checkbox,
  createTheme,
  defaultCssVariablesResolver,
  Drawer,
  Loader,
  Modal,
  NumberInput,
  Paper,
  Select,
  Switch,
  TextInput,
  Textarea,
  type CSSVariablesResolver,
} from '@mantine/core'

const brandScale = [
  '#fff4ec',
  '#ffe4d2',
  '#ffc7a6',
  '#f5a57a',
  '#e88855',
  '#d86e3a',
  '#c45b2d',
  '#a84a22',
  '#8a3c1b',
  '#6d2e14',
] as const

export const appFontFamily =
  '"General Sans", Inter, "Noto Sans SC", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

export const appCssVariablesResolver: CSSVariablesResolver = (theme) => {
  const defaultVariables = defaultCssVariablesResolver(theme)

  return {
    variables: {
      ...defaultVariables.variables,
      '--app-transition': '180ms ease',
    },
    light: {
      ...defaultVariables.light,
      '--app-bg': '#f6f3ef',
      '--app-body-background':
        'radial-gradient(circle at top, rgba(224, 122, 69, 0.16), transparent 24%), linear-gradient(180deg, #fbf8f5 0%, #f3ece6 100%)',
      '--app-surface': 'rgba(255, 255, 255, 0.88)',
      '--app-surface-alt': 'rgba(247, 250, 252, 0.92)',
      '--app-surface-elevated': 'rgba(255, 255, 255, 0.94)',
      '--app-surface-contrast': 'rgba(255, 255, 255, 0.98)',
      '--app-surface-overlay': 'rgba(255, 255, 255, 0.96)',
      '--app-dropdown-bg': '#ffffff',
      '--app-header-bg': 'rgba(255, 255, 255, 0.82)',
      '--app-header-bg-subtle': 'rgba(255, 255, 255, 0.72)',
      '--app-header-bg-strong': 'rgba(255, 255, 255, 0.9)',
      '--app-sidebar-bg': 'rgba(255, 255, 255, 0.84)',
      '--app-sidebar-control-bg': 'rgba(248, 251, 255, 0.78)',
      '--app-sidebar-shadow': '12px 0 40px rgba(15, 23, 42, 0.05)',
      '--app-nav-active-shadow': 'inset 0 1px 0 rgba(255, 255, 255, 0.82)',
      '--app-dashboard-panel-bg': 'rgba(255, 255, 255, 0.82)',
      '--app-dashboard-panel-subtle-bg': 'rgba(248, 251, 255, 0.72)',
      '--app-border': 'rgba(15, 23, 42, 0.12)',
      '--app-border-subtle': 'rgba(148, 163, 184, 0.18)',
      '--app-border-strong': 'rgba(15, 23, 42, 0.16)',
      '--app-input-bg': 'rgba(255, 255, 255, 0.92)',
      '--app-input-border': 'rgba(148, 163, 184, 0.28)',
      '--app-text': '#241910',
      '--app-muted': '#6f5c50',
      '--app-nav-text': '#5c463a',
      '--app-nav-active-text': '#8a3c1b',
      '--app-nav-active-bg': 'rgba(224, 122, 69, 0.16)',
      '--app-brand-soft-bg': 'rgba(224, 122, 69, 0.1)',
      '--app-brand-soft-bg-strong': 'rgba(224, 122, 69, 0.16)',
      '--app-brand-soft-border': 'rgba(196, 91, 45, 0.24)',
      '--app-brand-soft-border-strong': 'rgba(196, 91, 45, 0.36)',
      '--app-brand-contrast-text': '#ffffff',
      '--app-brand-accent': 'var(--mantine-color-brand-6)',
      '--app-media-bg': '#dce4ef',
      '--app-overlay-mask': 'rgba(15, 23, 42, 0.24)',
      '--app-section-gradient-muted':
        'linear-gradient(180deg, rgba(255, 255, 255, 0.65) 0%, rgba(233, 240, 248, 0.9) 100%)',
      '--app-section-gradient-strong':
        'linear-gradient(180deg, rgba(248, 251, 255, 0.96) 0%, rgba(231, 239, 248, 0.92) 100%)',
      '--app-shadow': '0 20px 60px rgba(15, 23, 42, 0.08)',
      '--app-shadow-strong': '0 18px 48px rgba(15, 23, 42, 0.12)',
      '--app-scrollbar-track': 'rgba(148, 163, 184, 0.12)',
    },
    dark: {
      ...defaultVariables.dark,
      '--app-bg': '#000000',
      '--app-body-background':
        'radial-gradient(ellipse 80% 42% at 50% -8%, rgb(196 91 45 / 34%), rgb(196 91 45 / 0%) 58%), radial-gradient(circle at 74% 16%, rgb(255 255 255 / 7%), rgb(255 255 255 / 0%) 28%), linear-gradient(180deg, #000000 0%, #120e0c 56%, #000000 100%)',
      '--app-surface': 'rgba(255, 255, 255, 0.055)',
      '--app-surface-alt': 'rgba(255, 255, 255, 0.075)',
      '--app-surface-elevated': 'rgba(255, 255, 255, 0.07)',
      '--app-surface-contrast': 'rgba(0, 0, 0, 0.72)',
      '--app-surface-overlay': 'rgba(8, 10, 14, 0.9)',
      '--app-dropdown-bg': '#080a0e',
      '--app-header-bg': 'rgba(0, 0, 0, 0.52)',
      '--app-header-bg-subtle': 'rgba(0, 0, 0, 0.38)',
      '--app-header-bg-strong': 'rgba(0, 0, 0, 0.7)',
      '--app-sidebar-bg': 'rgba(0, 0, 0, 0.68)',
      '--app-sidebar-control-bg': 'rgba(255, 255, 255, 0.055)',
      '--app-sidebar-shadow': 'none',
      '--app-nav-active-shadow': 'inset 0 1px 0 rgb(255 255 255 / 12%)',
      '--app-dashboard-panel-bg': 'rgba(255, 255, 255, 0.06)',
      '--app-dashboard-panel-subtle-bg': 'rgba(255, 255, 255, 0.045)',
      '--app-border': 'rgba(255, 255, 255, 0.14)',
      '--app-border-subtle': 'rgba(255, 255, 255, 0.09)',
      '--app-border-strong': 'rgba(255, 255, 255, 0.22)',
      '--app-input-bg': 'rgba(0, 0, 0, 0.28)',
      '--app-input-border': 'rgba(255, 255, 255, 0.16)',
      '--app-text': '#f8fafc',
      '--app-muted': 'rgba(255, 255, 255, 0.62)',
      '--app-nav-text': 'rgba(255, 255, 255, 0.72)',
      '--app-nav-active-text': '#ffffff',
      '--app-nav-active-bg': 'rgba(255, 255, 255, 0.1)',
      '--app-brand-soft-bg': 'rgba(224, 122, 69, 0.14)',
      '--app-brand-soft-bg-strong': 'rgba(224, 122, 69, 0.2)',
      '--app-brand-soft-border': 'rgba(255, 255, 255, 0.18)',
      '--app-brand-soft-border-strong': 'rgba(255, 255, 255, 0.28)',
      '--app-brand-contrast-text': '#ffffff',
      '--app-brand-accent': 'var(--mantine-color-brand-6)',
      '--app-media-bg': '#06080d',
      '--app-overlay-mask': 'rgba(0, 0, 0, 0.45)',
      '--app-section-gradient-muted':
        'linear-gradient(180deg, rgba(255, 255, 255, 0.075) 0%, rgba(255, 255, 255, 0.035) 100%)',
      '--app-section-gradient-strong':
        'linear-gradient(180deg, rgba(255, 255, 255, 0.11) 0%, rgba(255, 255, 255, 0.045) 100%)',
      '--app-shadow': '0 24px 80px rgba(0, 0, 0, 0.32)',
      '--app-shadow-strong': '0 28px 100px rgba(0, 0, 0, 0.44)',
      '--app-scrollbar-track': 'rgba(255, 255, 255, 0.04)',
    },
  }
}

export const appTheme = createTheme({
  primaryColor: 'brand',
  primaryShade: 6,
  defaultRadius: 'md',
  fontFamily: appFontFamily,
  headings: {
    fontFamily: appFontFamily,
    fontWeight: '500',
  },
  colors: {
    brand: brandScale,
    green: brandScale,
    surface: [
      '#f7f8fa',
      '#e8ebf1',
      '#d0d6e1',
      '#b7c0d1',
      '#9eaabd',
      '#8794a8',
      '#6e7d91',
      '#556477',
      '#3b495d',
      '#223044',
    ],
  },
  other: {
    surfaceDefault: 'var(--app-surface)',
    surfaceSubtle: 'var(--app-surface-alt)',
    surfaceHighlight: 'rgba(107, 154, 255, 0.08)',
    surfaceDanger: 'rgba(239, 68, 68, 0.08)',
    borderDefault: 'var(--app-border)',
    borderHighlight: 'rgba(107, 154, 255, 0.28)',
    borderDanger: 'rgba(239, 68, 68, 0.25)',
    textMuted: 'var(--app-muted)',
  },
  components: {
    AppShell: AppShell.extend({
      styles: {
        header: {
          background: 'var(--app-header-bg)',
          borderBottomColor: 'var(--app-border)',
          backdropFilter: 'blur(18px)',
        },
        main: {
          background: 'transparent',
        },
      },
    }),
    Button: Button.extend({
      defaultProps: {
        radius: 'md',
      },
      styles: {
        root: {
          fontWeight: 600,
        },
      },
    }),
    Modal: Modal.extend({
      defaultProps: {
        centered: true,
        radius: 'lg',
      },
      styles: {
        content: {
          background: 'var(--app-surface-overlay)',
          border: '1px solid var(--app-border)',
          backdropFilter: 'blur(18px)',
        },
        header: {
          background: 'transparent',
        },
      },
    }),
    Drawer: Drawer.extend({
      styles: {
        content: {
          background: 'var(--app-surface-overlay)',
          borderInlineStart: '1px solid var(--app-border)',
          backdropFilter: 'blur(18px)',
        },
        header: {
          background: 'transparent',
        },
      },
    }),
    TextInput: TextInput.extend({
      defaultProps: {
        radius: 'md',
        size: 'md',
      },
      styles: {
        input: {
          background: 'var(--app-input-bg)',
          borderColor: 'var(--app-input-border)',
        },
        label: {
          marginBottom: 6,
          color: 'var(--app-text)',
          fontWeight: 500,
        },
      },
    }),
    Select: Select.extend({
      defaultProps: {
        radius: 'md',
        size: 'md',
      },
      styles: {
        input: {
          background: 'var(--app-input-bg)',
          borderColor: 'var(--app-input-border)',
        },
        label: {
          marginBottom: 6,
          color: 'var(--app-text)',
          fontWeight: 500,
        },
        dropdown: {
          background: 'var(--app-dropdown-bg)',
          borderColor: 'var(--app-border)',
        },
      },
    }),
    NumberInput: NumberInput.extend({
      defaultProps: {
        radius: 'md',
        size: 'md',
      },
      styles: {
        input: {
          background: 'var(--app-input-bg)',
          borderColor: 'var(--app-input-border)',
        },
        label: {
          marginBottom: 6,
          color: 'var(--app-text)',
          fontWeight: 500,
        },
      },
    }),
    Textarea: Textarea.extend({
      defaultProps: {
        radius: 'md',
        size: 'md',
      },
      styles: {
        input: {
          background: 'var(--app-input-bg)',
          borderColor: 'var(--app-input-border)',
        },
        label: {
          marginBottom: 6,
          color: 'var(--app-text)',
          fontWeight: 500,
        },
      },
    }),
    Checkbox: Checkbox.extend({
      defaultProps: {
        color: 'brand',
      },
    }),
    Switch: Switch.extend({
      defaultProps: {
        color: 'brand',
      },
    }),
    Badge: Badge.extend({
      defaultProps: {
        radius: 'xl',
        variant: 'light',
      },
    }),
    Alert: Alert.extend({
      defaultProps: {
        radius: 'lg',
        variant: 'light',
      },
      styles: {
        root: {
          backdropFilter: 'blur(12px)',
        },
      },
    }),
    Accordion: Accordion.extend({
      defaultProps: {
        radius: 'lg',
        variant: 'separated',
      },
      styles: {
        item: {
          background: 'var(--app-surface)',
          borderColor: 'var(--app-border)',
        },
        control: {
          color: 'var(--app-text)',
        },
        content: {
          color: 'var(--app-muted)',
        },
      },
    }),
    Paper: Paper.extend({
      defaultProps: {
        radius: 'xl',
        shadow: 'sm',
        withBorder: true,
      },
      styles: {
        root: {
          background: 'var(--app-surface)',
          borderColor: 'var(--app-border)',
          boxShadow: 'var(--app-shadow)',
          backdropFilter: 'blur(16px)',
        },
      },
    }),
    Card: Card.extend({
      defaultProps: {
        radius: 'xl',
        shadow: 'sm',
        withBorder: true,
      },
      styles: {
        root: {
          background: 'var(--app-surface)',
          borderColor: 'var(--app-border)',
          boxShadow: 'var(--app-shadow)',
          backdropFilter: 'blur(16px)',
        },
      },
    }),
    Loader: Loader.extend({
      defaultProps: {
        color: 'brand',
      },
    }),
    ActionIcon: ActionIcon.extend({
      defaultProps: {
        radius: 'xl',
        variant: 'subtle',
      },
    }),
  },
})
