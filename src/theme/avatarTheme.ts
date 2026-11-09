/**
 * avatarTheme — 字体常量
 *
 * M-14：这个文件曾定义完整 Mantine 主题（avatarTheme），但从未被引用——
 * 真正生效的是 shared/mantine/theme.ts 里的 appTheme。两份主题并存会让
 * 组件样式由不确定的一方覆盖，因此删除重复的 theme 对象，
 * 只保留 Flova 设计系统的字体常量，供需要衬线标题的页面使用。
 *
 * 主题请改 src/shared/mantine/theme.ts；色值请改 src/styles/tokens.css。
 */

export const avatarFontArt = 'var(--font-art)'
export const avatarFontBody = 'var(--font-body)'
export const avatarFontMono = 'var(--font-mono)'
