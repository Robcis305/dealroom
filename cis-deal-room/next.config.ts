import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdfjs-dist'],
  experimental: {
    optimizePackageImports: ['react-pdf'],
  },
};

export default nextConfig;
