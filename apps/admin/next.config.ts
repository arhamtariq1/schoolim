import type { NextConfig } from 'next';

const config: NextConfig = {
  // @ilm/ui ships TypeScript source rather than a build, so Next compiles it
  // in-place. That keeps design-system edits instant in development, which is
  // the whole reason the package is copy-in rather than a dependency.
  transpilePackages: ['@ilm/ui'],
  reactStrictMode: true,
  typedRoutes: true,
};

export default config;
