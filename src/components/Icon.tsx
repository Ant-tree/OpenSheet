// Icons are hand-drawn SVGs saved in src/icons/*.svg. We inline their markup so
// they inherit `currentColor` (following button text color / active states).
const modules = import.meta.glob('../icons/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const icons: Record<string, string> = {}
for (const path in modules) {
  const name = path.split('/').pop()!.replace('.svg', '')
  icons[name] = modules[path]
}

export type IconName = string

export default function Icon({ name, className }: { name: IconName; className?: string }) {
  const svg = icons[name]
  if (!svg) return null
  return (
    <span
      className={`icon${className ? ' ' + className : ''}`}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}
