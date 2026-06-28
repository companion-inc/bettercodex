import path from "node:path";
import {fileURLToPath} from "node:url";

const webDir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import("next").NextConfig} */
const nextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  turbopack: {
    root: path.resolve(webDir, "../.."),
  },
};

export default nextConfig;
