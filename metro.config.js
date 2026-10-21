const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The backup API in ./supabase runs on Supabase Edge Functions (Deno); keep it out of the app bundle.
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const serverDir = escape(path.join(__dirname, 'supabase')).replace(/\\\\|\//g, '[\\\\/]');
config.resolver.blockList = [new RegExp(`^${serverDir}[\\\\/].*`)];

// expo-sqlite on web (used only for local UI previews) loads a .wasm build.
config.resolver.assetExts.push('wasm');
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  return middleware(req, res, next);
};

module.exports = config;
