const path = require('path');
const { createApp } = require('../server');

module.exports = createApp({
  projectRoot: path.join(__dirname, '..'),
  runtimeRoot: path.join('/tmp', 'zaya-runtime'),
});
