const fs = require('node:fs');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
exports.capture = async (page, file, config, slot) => {
  await page.screenshot({ path: file, fullPage: true });
  const copiedRoot = path.resolve(__dirname, '../../../..');
  const actualSource = execFileSync('git', ['rev-parse','HEAD'], { cwd: config.operatorRoot, encoding: 'utf8' }).trim();
  const actualTree = execFileSync('git', ['rev-parse','HEAD^{tree}'], { cwd: config.operatorRoot, encoding: 'utf8' }).trim();
  const dirty = execFileSync('git', ['status','--porcelain'], { cwd: config.operatorRoot, encoding: 'utf8' }).trim();
  // The operator copies committed blobs, without .git. Its source receipt is
  // authoritative for synthetic scope only; local worktree dirtiness stays visible.
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const fixtureFiles = Object.fromEntries(fs.readdirSync(__dirname).filter(name => /\.(?:ts|cjs)$/.test(name)).sort().map(name =>
    [name, hash(fs.readFileSync(path.join(__dirname, name)))]));
  const browserFiles = Object.fromEntries(Object.keys(config.browserFiles).sort().map(name => {
    const file = path.resolve(copiedRoot, name);
    if (!file.startsWith(copiedRoot + path.sep)) throw Error('CHAT_FIXTURE_BROWSER_SOURCE_PATH');
    return [name, hash(fs.readFileSync(file))];
  }));
  const fixtureMatches = Object.keys(browserFiles).length > 0 && Object.entries(browserFiles).every(([name, actual]) => actual === config.browserFiles[name]);
  const authoritative = dirty === '' && actualSource === config.source && actualTree === config.tree && fixtureMatches;
  fs.writeFileSync(file + '.provenance.json', JSON.stringify({ source: config.source,
    sourceTree: config.tree, actualSource, actualTree, sourceDirty: dirty !== '', authoritativeForSyntheticScope: authoritative,
    scope: 'chat-only; local deterministic provider; no Factory; no installed or paid qualification',
    slot, fixtureFiles, browserFiles, fixtureMatches, screenshotSha256: hash(fs.readFileSync(file)), viewport: page.viewportSize(),
    browser: page.context().browser().version(), capturedAt: new Date().toISOString() }, null, 2) + '\n');
  if (!authoritative) throw Error('CHAT_FIXTURE_SCREENSHOT_SOURCE_DRIFT');
};
