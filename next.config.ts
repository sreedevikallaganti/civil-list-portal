/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    const pbUrl = (process.env.POCKETBASE_URL || 'http://172.30.0.200:8091').replace(/\/+$/, '');
    return [
      { source: '/pb/:path*', destination: `${pbUrl}/:path*` },
    ];
  },
};

module.exports = nextConfig;