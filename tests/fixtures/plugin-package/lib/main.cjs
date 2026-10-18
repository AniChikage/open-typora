const helper = require('./helper.cjs');
const shared = require('./shared');
const css = require('../style.css');
// The loader must preserve these literal strings in user source.
const marker = '/*__ENTRY__*/ /*__MODULES__*/';
class PackageFixture extends BasePlugin {
  style() { return css; }
  process() {
    window.packageProbe = { ticks: 0, cached: helper.shared === shared, marker };
    setInterval(() => window.packageProbe.ticks++, 20);
  }
  call() { this.utils.insertText(helper.text + shared.value); }
}
module.exports = { plugin: PackageFixture };
