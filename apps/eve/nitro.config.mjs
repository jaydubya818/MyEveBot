import assert from 'node:assert/strict';
import {lstatSync, readFileSync, realpathSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

const STUDIO = '@remotion/studio';

/** Public nf3 build hooks. Revisit these explicit guards with lock updates. */
export function createRemotionTraceHooks(sourceRoot) {
  let context;
  return {
    traceStart(inputs) {
      assert(!context, 'REMOTION_TRACE_CONCURRENT_OR_INCOMPLETE');
      const root = resolve(sourceRoot);
      assert.equal(realpathSync(root), root, 'REMOTION_TRACE_SOURCE_ALIAS');
      const ownedFile = (path) => {
        const key = relative(root, path);
        assert(key && key !== '..' && !key.startsWith('..' + sep) && !key.startsWith(sep), 'REMOTION_TRACE_SOURCE_ESCAPE');
        assert.equal(realpathSync(path), path, 'REMOTION_TRACE_INPUT_ALIAS');
        const stat = lstatSync(path);
        assert(stat.isFile(), 'REMOTION_TRACE_INPUT_TYPE');
        return stat;
      };
      const metadata = (path) => {
        assert(ownedFile(path).size <= 1024 * 1024, 'REMOTION_TRACE_METADATA_LIMIT');
        return JSON.parse(readFileSync(path, 'utf8'));
      };
      const studioRoot = join(root, 'node_modules', STUDIO);
      const studioJson = join(studioRoot, 'package.json');
      const studio = metadata(studioJson);
      assert.equal(studio.name, STUDIO, 'REMOTION_TRACE_STUDIO_NAME');
      assert.equal(studio.version, '4.0.499', 'REMOTION_TRACE_STUDIO_VERSION');
      assert.equal(studio.dependencies?.semver, '7.5.3', 'REMOTION_TRACE_DECLARATION');
      const chain = [
        ['semver', '7.5.3', {'lru-cache': '^6.0.0'}],
        ['lru-cache', '6.0.0', {yallist: '^4.0.0'}],
        ['yallist', '4.0.0', {}],
      ].map(([name, version, dependencies]) => {
        const path = join(studioRoot, 'node_modules', name);
        const value = metadata(join(path, 'package.json'));
        assert.equal(value.name, name, 'REMOTION_TRACE_DEPENDENCY_NAME');
        assert.equal(value.version, version, 'REMOTION_TRACE_DEPENDENCY_VERSION');
        assert.deepEqual(value.dependencies || {}, dependencies, 'REMOTION_TRACE_DEPENDENCY_DECLARATIONS');
        assert.equal(Object.keys(value.optionalDependencies || {}).length, 0, 'REMOTION_TRACE_OPTIONAL_DEPENDENCY');
        assert.equal(Object.keys(value.peerDependencies || {}).length, 0, 'REMOTION_TRACE_PEER_DEPENDENCY');
        return {name, version, path};
      });
      ownedFile(join(chain[0].path, 'index.js'));
      const entry = createRequire(studioJson).resolve('semver');
      ownedFile(entry);
      assert.equal(entry, join(chain[0].path, 'index.js'), 'REMOTION_TRACE_DEPENDENCY_ENTRY');
      // NFT itself traces this entry and its real transitive imports. No SDK
      // code is called here and no file is written or transplanted afterward.
      if (!inputs.includes(entry)) inputs.push(entry);
      context = {studioRoot, studioJson, entry, chain};
    },
    tracedFiles(files) {
      assert(context, 'REMOTION_TRACE_HOOK_ORDER');
      try {
        const {studioRoot, studioJson, entry, chain} = context;
        const records = Object.values(files);
        assert(records.length <= 200000, 'REMOTION_TRACE_RECORD_LIMIT');
        const studios = records.filter(file => file.pkgName === STUDIO);
        assert(studios.length && studios.every(file => file.pkgPath === studioRoot && file.pkgVersion === '4.0.499'),
          'REMOTION_TRACE_STUDIO_CONTEXT');
        for (const item of chain) assert(records.some(file => file.pkgName === item.name
          && file.pkgVersion === item.version && file.pkgPath === item.path), 'REMOTION_TRACE_CHAIN_MISSING');
        const semvers = records.filter(file => file.pkgName === 'semver');
        assert(semvers.some(file => file.pkgVersion === '7.8.5') && semvers.every(file => ['7.5.3','7.8.5'].includes(file.pkgVersion)),
          'REMOTION_TRACE_BASELINE_SEMVER_CONTEXT');
        for (const file of semvers.filter(file => file.pkgVersion === '7.5.3')) {
          assert.equal(file.pkgPath, chain[0].path, 'REMOTION_TRACE_NESTED_ORIGIN');
          assert(Array.isArray(file.parents), 'REMOTION_TRACE_PARENT_LIST');
          assert(file.parents.every(path => !files[path] || files[path].pkgName === 'semver'
            || (files[path].pkgName === STUDIO && files[path].pkgPath === studioRoot)), 'REMOTION_TRACE_UNEXPECTED_PARENT');
        }
        const anchor = files[studioJson] || {path: studioJson, subpath: 'package.json', parents: [],
          pkgPath: studioRoot, pkgName: STUDIO, pkgVersion: '4.0.499'};
        assert(anchor.path === studioJson && anchor.pkgPath === studioRoot && anchor.pkgName === STUDIO
          && anchor.pkgVersion === '4.0.499', 'REMOTION_TRACE_PARENT_ANCHOR');
        const value = files[entry];
        assert(value && value.path === entry && value.pkgPath === chain[0].path
          && value.pkgName === 'semver' && value.pkgVersion === '7.5.3', 'REMOTION_TRACE_ENTRY_MISSING');
        // Studio's package.json DECLARES this relationship. This processed nf3
        // packaging edge is not an observed import; original NFT reasons stay
        // untouched. One Studio parent keeps 7.8.5 at the root under the pinned
        // nf3 ordering (zero-parent priority, parent count, then higher version),
        // while nf3 writes Studio's 7.5.3 alias through its normal writer.
        files[studioJson] = anchor;
        files[entry] = {...value, parents: [...new Set([...value.parents, studioJson])]};
      } finally {
        context = undefined;
      }
    },
  };
}

export default {
  traceOpts: {hooks: createRemotionTraceHooks(fileURLToPath(new URL('../../', import.meta.url)))},
};
