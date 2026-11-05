interface BrandLogoProps {
  size?: number
}

export default function BrandLogo({ size = 36 }: BrandLogoProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      style={{ display: 'block', flex: '0 0 auto' }}
    >
      <rect width="48" height="48" rx="14" fill="#E07A45" />
      <circle cx="22" cy="18.5" r="6.2" fill="#FFF6EE" />
      <path d="M12 36.5c2.2-6.2 5.8-9.2 10-9.2s7.8 3 10 9.2" fill="#2A1B14" />
      <path
        d="M31.5 14.2c2.8 2 4.6 4.8 4.6 8"
        stroke="#FFF6EE"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M33.6 10.4c3.8 2.8 6.2 6.8 6.2 11.2"
        stroke="#FFF6EE"
        strokeOpacity="0.7"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}
