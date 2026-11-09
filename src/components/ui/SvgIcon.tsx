/**
 * Inline SVG icon — no external dependency
 * Usage: <SvgIcon d="M3 9l9-7 9 7v11..." />
 */
export function SvgIcon({ d, size = 15, strokeWidth = 1.6 }: { d: string; size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

/* Common icon set */
export const HomeIcon = () => <SvgIcon d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
export const FolderIcon = () => <SvgIcon d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
export const SkillIcon = () => <SvgIcon d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
export const SparkIcon = () => <SvgIcon d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
export const LibraryIcon = () => <SvgIcon d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2zm20 0h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
export const PlayIcon = () => <SvgIcon d="M23 7l-7 5 7 5V7zM1 5h15a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H1z" />
export const BookIcon = () => <SvgIcon d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
export const TerminalIcon = () => <SvgIcon d="M4 17l6-6-6-6m8 14h8" />
export const GiftIcon = () => <SvgIcon d="M20 12v10H4V12M22 7H2v5h20V7zM12 22V7m0-5a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" />
export const ShareIcon = () => <SvgIcon d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
export const SupportIcon = () => <SvgIcon d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
export const PlusIcon = () => <SvgIcon d="M12 5v14M5 12h14" size={14} />
export const SettingIcon = () => <SvgIcon d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.07-3a7 7 0 0 0-.1-1.2l2.04-1.6-2-3.46-2.4.97a7 7 0 0 0-2.07-1.2L14 3h-4l-.54 2.51a7 7 0 0 0-2.07 1.2l-2.4-.97-2 3.46 2.04 1.6A7 7 0 0 0 5 12c0 .41.04.81.1 1.2L3.06 14.8l2 3.46 2.4-.97a7 7 0 0 0 2.07 1.2L10 21h4l.54-2.51a7 7 0 0 0 2.07-1.2l2.4.97 2-3.46-2.04-1.6A7 7 0 0 0 19.07 12z" size={14} />
