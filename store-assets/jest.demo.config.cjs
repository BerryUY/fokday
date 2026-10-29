/** Runs only the Play Store demo-data builder (not part of the normal test suite). */
const base = require('../jest.config.js');

module.exports = { ...base, rootDir: '..', roots: ['<rootDir>/store-assets/demo'] };
