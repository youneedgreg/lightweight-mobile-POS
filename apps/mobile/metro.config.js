// Expo's default config detects the pnpm monorepo and watches the workspace root,
// so packages/shared is picked up without extra watchFolders.
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: "./src/global.css" });
