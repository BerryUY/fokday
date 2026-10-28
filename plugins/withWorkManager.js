const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * The AdMob SDK still asks for WorkManager 2.7.0, whose database could not be created in a
 * minified release build: the app closed on the splash screen. Pinning a current WorkManager
 * (its Room database and R8 rules are up to date) fixes it; the keep rules in app.json
 * (expo-build-properties) are the second safety net.
 */
const WORK_VERSION = '2.11.2';
const LINE = `    implementation("androidx.work:work-runtime:${WORK_VERSION}") // FokDay: AdMob pulls 2.7.0`;

module.exports = function withWorkManager(config) {
  return withAppBuildGradle(config, (cfg) => {
    const gradle = cfg.modResults.contents;
    if (!gradle.includes('androidx.work:work-runtime')) {
      cfg.modResults.contents = gradle.replace(/\ndependencies\s*\{\n/, (m) => `${m}${LINE}\n`);
    }
    return cfg;
  });
};
