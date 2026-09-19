/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /**
   * Default `.next`, overridable per process. Several agents build this repo
   * concurrently; sharing one output directory tears it mid-write and produces
   * failures that look real but are not — a "Cannot find module for page" for a
   * route nobody touched, or ENOENT on build-manifest.json. Set NEXT_DIST_DIR
   * to build in isolation. Unset, behaviour is unchanged.
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
