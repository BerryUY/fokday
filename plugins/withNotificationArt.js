const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

/**
 * Copies Foki's faces (assets/notifications/foki_*.png) into the Android drawables, so each
 * notification can show its own image next to the text. See patches/expo-notifications*.patch.
 */
module.exports = function withNotificationArt(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const source = path.join(cfg.modRequest.projectRoot, 'assets', 'notifications');
      const target = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'drawable-nodpi');
      fs.mkdirSync(target, { recursive: true });
      for (const file of fs.readdirSync(source).filter((f) => f.endsWith('.png'))) {
        fs.copyFileSync(path.join(source, file), path.join(target, file));
      }
      return cfg;
    },
  ]);
};
