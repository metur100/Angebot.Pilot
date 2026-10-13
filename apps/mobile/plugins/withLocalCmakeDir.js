// Config plugin (Windows build helper): when ANDROID_CMAKE_DIR is set, writes `cmake.dir=` into android/local.properties
// so every native module uses that CMake. The Android SDK's default CMake 3.22.1 ships ninja 1.10, which fails on
// Windows with "Filename longer than 260 characters" for React Native codegen objects; CMake ≥ 3.30 (ninja ≥ 1.12)
// supports long paths. Example:  set ANDROID_CMAKE_DIR=%ANDROID_HOME%\cmake\3.31.6
// Nothing machine-specific is committed: local.properties lives in the git-ignored android/ folder.
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

module.exports = function withLocalCmakeDir(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const dir = process.env.ANDROID_CMAKE_DIR;
      if (!dir) return cfg;
      const file = path.join(cfg.modRequest.platformProjectRoot, 'local.properties');
      const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      const lines = existing.split(/\r?\n/).filter((l) => l && !l.startsWith('cmake.dir='));
      lines.push(`cmake.dir=${dir.replace(/\\/g, '/')}`);
      fs.writeFileSync(file, `${lines.join('\n')}\n`);
      return cfg;
    },
  ]);
};
