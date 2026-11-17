const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { withSharedTypeScript } = require('./metro-resolver.cjs');

const config = getDefaultConfig(__dirname);
const repositoryRoot = path.resolve(__dirname, '..');
config.watchFolders = [...new Set([...(config.watchFolders ?? []), repositoryRoot])];
config.resolver.resolveRequest = withSharedTypeScript(repositoryRoot, config.resolver.resolveRequest);

module.exports = config;
