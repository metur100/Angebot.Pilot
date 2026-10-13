// Config plugin: release signing for Android without keeping secrets in the repository.
//
// The upload keystore is configured on the build machine only, e.g. in ~/.gradle/gradle.properties:
//   ANGEBOTPILOT_UPLOAD_STORE_FILE=C:/Users/<you>/keystore/angebotpilot
//   ANGEBOTPILOT_UPLOAD_STORE_PASSWORD=...
//   ANGEBOTPILOT_UPLOAD_KEY_ALIAS=angebotpilot-upload
//   ANGEBOTPILOT_UPLOAD_KEY_PASSWORD=...
// (or the same names as environment variables / -P flags). When they are missing, release builds fall back to the
// debug key so local test APKs can still be installed - such builds must never be uploaded to Google Play.
const { withAppBuildGradle } = require('expo/config-plugins');

const MARKER = '// @angebotpilot/release-signing';

function addReleaseSigning(gradle) {
  if (gradle.includes(MARKER)) return gradle;

  const helper = [
    MARKER,
    "def apSigningValue = { String name -> (project.findProperty(name) ?: System.getenv(name))?.toString() }",
    "def apUploadStoreFile = apSigningValue('ANGEBOTPILOT_UPLOAD_STORE_FILE')",
    'def apHasUploadKey = apUploadStoreFile != null && !apUploadStoreFile.isEmpty()',
    'if (!apHasUploadKey) {',
    "    logger.warn('AngebotPilot: ANGEBOTPILOT_UPLOAD_STORE_FILE not set - release builds are signed with the DEBUG key (local testing only).')",
    '}',
    '',
  ].join('\n');
  let out = gradle.replace(/\nandroid\s*\{/, (m) => `\n${helper}${m}`);

  const releaseSigning = [
    '',
    '        release {',
    '            if (apHasUploadKey) {',
    '                storeFile file(apUploadStoreFile)',
    "                storePassword apSigningValue('ANGEBOTPILOT_UPLOAD_STORE_PASSWORD')",
    "                keyAlias apSigningValue('ANGEBOTPILOT_UPLOAD_KEY_ALIAS')",
    "                keyPassword apSigningValue('ANGEBOTPILOT_UPLOAD_KEY_PASSWORD')",
    '            }',
    '        }',
  ].join('\n');
  out = out.replace(/signingConfigs\s*\{/, (m) => `${m}${releaseSigning}`);

  // Only inside the release buildType: replace its "signingConfig signingConfigs.debug".
  out = out.replace(
    /(buildTypes\s*\{[\s\S]*?\n\s*release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/,
    (_m, head) => `${head}signingConfig apHasUploadKey ? signingConfigs.release : signingConfigs.debug`,
  );
  return out;
}

function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') throw new Error('withAndroidReleaseSigning: expected a Groovy build.gradle');
    cfg.modResults.contents = addReleaseSigning(cfg.modResults.contents);
    return cfg;
  });
}

module.exports = withAndroidReleaseSigning;
module.exports.addReleaseSigning = addReleaseSigning;
