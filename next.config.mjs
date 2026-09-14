/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Disable source maps in dev — prevents Turbopack from reading .map files
  // from node_modules, which was timing out on a full disk
  productionBrowserSourceMaps: false,
};

export default nextConfig;
