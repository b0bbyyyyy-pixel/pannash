/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  experimental: {
    optimizePackageImports: [
      'recharts',
      'framer-motion',
      '@dnd-kit/core',
      '@dnd-kit/sortable',
      'googleapis',
    ],
  },
};

export default nextConfig;
