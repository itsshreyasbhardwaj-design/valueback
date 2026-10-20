import Link from 'next/link';

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" role="img" aria-label="ValueBack" className="shrink-0">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      {/* a value mark returning to its owner */}
      <path
        d="M9 11.5l5 9 5-9"
        fill="none"
        stroke="var(--accent-contrast)"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20.5 20.5h-3.2a3.3 3.3 0 0 1 0-6.6h4.7m0 0-1.9-1.9m1.9 1.9-1.9 1.9"
        fill="none"
        stroke="var(--accent-contrast)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.85"
      />
    </svg>
  );
}

export function Wordmark({ href = '/', size = 28 }: { href?: string; size?: number }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 font-semibold tracking-tight">
      <Logo size={size} />
      <span className="text-[1.0625rem]">ValueBack</span>
    </Link>
  );
}
