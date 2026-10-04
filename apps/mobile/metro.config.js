// Expo's default config detects the pnpm monorepo and watches the workspace root,
// so packages/shared is picked up without extra watchFolders.
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// expo-sqlite on web (development preview only) loads a WebAssembly build of SQLite,
// which needs .wasm assets and cross-origin isolation headers for SharedArrayBuffer.
config.resolver.assetExts.push("wasm");
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader("Cross-Origin-Embedder-Policy", "credentialless");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  return middleware(req, res, next);
};

module.exports = withNativeWind(config, { input: "./src/global.css" });
