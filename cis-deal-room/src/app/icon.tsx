import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

/**
 * Favicon served from /icon (replaces the Next.js default at /favicon.ico).
 * Dark base (#0D0D0D) + brand red (#E10600) wordmark, matching MASTER.md.
 * Rendered at build time via Next.js ImageResponse — no binary asset to ship.
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          height: '100%',
          background: '#0D0D0D',
          color: '#E10600',
          fontSize: 15,
          fontWeight: 900,
          letterSpacing: '-0.04em',
          fontFamily: 'Arial, sans-serif',
        }}
      >
        CIS
      </div>
    ),
    { ...size },
  );
}
