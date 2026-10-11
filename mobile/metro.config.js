const { createHash } = require('node:crypto');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
const publicEnvironment = Object.keys(process.env)
  .filter((name) => name.startsWith('EXPO_PUBLIC_'))
  .sort()
  .map((name) => [name, process.env[name]]);
const environmentHash = createHash('sha256')
  .update(
    JSON.stringify([process.env.APP_ENV ?? 'development', publicEnvironment]),
  )
  .digest('hex');

// Release transforms inline public values, and Expo skips cache resets in CI.
// Changing environments or public configuration must invalidate those literals.
config.cacheVersion = `${config.cacheVersion ?? ''}:${environmentHash}`;

module.exports = config;
