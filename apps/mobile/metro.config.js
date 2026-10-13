// Metro configuration. apps/mobile is a standalone npm project; the shared TypeScript packages in ../../packages are
// linked via "file:" dependencies (symlinks) and compiled from source.
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const packagesRoot = path.resolve(projectRoot, '../../packages');
const appNodeModules = path.resolve(projectRoot, 'node_modules');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [...(config.watchFolders ?? []), packagesRoot];
config.resolver.nodeModulesPaths = [appNodeModules];
config.resolver.unstable_enableSymlinks = true;
config.resolver.unstable_enablePackageExports = true;

// "@/…" is the app source alias (tsconfig paths are not used by Metro, see app.config.ts).
// Bare imports from the shared packages (big.js, zod, ...) must resolve from this app's node_modules - never from the
// workspace node_modules at the repository root, which belongs to the web app and may hold different versions.
const upstreamResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const resolve = upstreamResolve ?? context.resolveRequest;
  if (moduleName.startsWith('@/')) {
    return resolve(context, path.join(projectRoot, 'src', moduleName.slice(2)), platform);
  }
  const isBare = !moduleName.startsWith('.') && !path.isAbsolute(moduleName);
  if (isBare && path.resolve(context.originModulePath).toLowerCase().startsWith(packagesRoot.toLowerCase())) {
    return resolve({ ...context, originModulePath: path.join(projectRoot, 'package.json') }, moduleName, platform);
  }
  return resolve(context, moduleName, platform);
};

module.exports = config;
