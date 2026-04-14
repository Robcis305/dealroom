import Image from 'next/image';
import { clsx } from 'clsx';

type LogoSize = 'sm' | 'md' | 'lg' | 'xl';

interface LogoProps {
  size?: LogoSize;
  className?: string;
  /** When true, renders with white fill (for use on dark backgrounds) */
  inverse?: boolean;
}

const SIZE_DIMENSIONS: Record<LogoSize, { w: number; h: number }> = {
  sm: { w: 96, h: 41 },
  md: { w: 144, h: 61 },
  lg: { w: 200, h: 85 },
  xl: { w: 280, h: 119 },
};

/**
 * CIS Partners brand logo, served from /public/cis-partners-logo.svg.
 *
 * Primary use: LoginPage / VerifyPage / WorkspaceShell header /
 * email templates. The SVG has a single color (currently black);
 * pass `inverse` when rendering on a dark background — it flips the
 * fill via CSS filter.
 */
export function Logo({ size = 'md', className, inverse = false }: LogoProps) {
  const { w, h } = SIZE_DIMENSIONS[size];
  return (
    <Image
      src="/cis-partners-logo.svg"
      alt="CIS Partners"
      width={w}
      height={h}
      priority
      className={clsx(
        'select-none',
        inverse && 'invert',
        className
      )}
    />
  );
}
