const paths = {
  plus: <path d="M10 4.5v11M4.5 10h11" />,
  back: <path d="m11.5 5-5 5 5 5" />,
  trash: (
    <>
      <path d="M3.5 6h13" />
      <path d="M7.5 6V4.5h5V6M5.5 6l.6 9.4a1.5 1.5 0 0 0 1.5 1.4h4.8a1.5 1.5 0 0 0 1.5-1.4L14.5 6M8.3 9.5v4M11.7 9.5v4" />
    </>
  ),
  check: <path d="m4.5 10.5 3.5 3.5 7.5-8" />,
  again: <path d="M4.5 10a5.5 5.5 0 1 1 1.6 3.9M4.5 15.5v-4h4" />,
  play: <path d="M7 4.5v11l9-5.5z" />,
} as const

interface IconProps {
  name: keyof typeof paths
  size?: number
}

/** Inline SVG icon, sized and stroked by the design language. */
export function Icon({ name, size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}
