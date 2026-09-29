import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@prh/shared", "@prh/ui"],
};

// Lets `next dev` see Cloudflare bindings (wrangler.jsonc) the way the deployed Worker does.
initOpenNextCloudflareForDev();

export default config;
