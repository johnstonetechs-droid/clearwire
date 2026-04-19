// Metro config for a pnpm monorepo.
// Tells Metro to look up the tree for node_modules and to watch
// sibling packages so changes in packages/* hot-reload in the app.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files in the monorepo
config.watchFolders = [workspaceRoot];

// 2. Resolve from both app and workspace root node_modules
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Force Metro to resolve symlinks (pnpm uses symlinks heavily)
config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_enablePackageExports = true;

// 4. Ignore pnpm's atomic-install temp directories (<package>_tmp_<pid>_<n>).
// Metro's file-map sometimes catches them mid-install and then crashes
// trying to install an fs.watch on a path that's already been renamed.
config.resolver.blockList = [
  /[\\/]\.pnpm[\\/].*_tmp_\d+_\d+[\\/]/,
];

module.exports = config;
