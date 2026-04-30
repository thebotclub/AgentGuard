/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@agentguard/shared'],
  experimental: {
    // Enable server components and streaming
  },
};

module.exports = nextConfig;
