import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolve as metroResolve, type CustomResolver, type CustomResolutionContext } from 'metro-resolver';
const require = createRequire(import.meta.url);
const { withSharedTypeScript } = require('../metro-resolver.cjs') as {
  withSharedTypeScript: (root: string, previous?: CustomResolver) => CustomResolver;
};
const root = fileURLToPath(new URL('../../', import.meta.url));
const origin = path.join(root, 'src/tools/settings.ts');
function context(files: string[], originModulePath = origin): CustomResolutionContext {
  const existing = new Set(files.map(file => path.join(root, file)));
  return {
    originModulePath, resolveRequest: metroResolve, sourceExts:['ts','tsx','js','jsx','json'], assetExts:new Set(['png']),
    preferNativePlatform:true, mainFields:['browser','main'], nodeModulesPaths:[], customResolverOptions:{},
    allowHaste:false, disableHierarchicalLookup:false, dev:true, extraNodeModules:null,
    doesFileExist: file => existing.has(file),
    fileSystemLookup: file => existing.has(file) ? {exists:true,type:'f',realPath:file} : {exists:false},
    getPackage:()=>null, getPackageForModule:()=>null, resolveAsset:()=>null,
    redirectModulePath:file=>file, resolveHasteModule:()=>null, resolveHastePackage:()=>null,
    unstable_conditionNames:[], unstable_conditionsByPlatform:{}, unstable_enablePackageExports:true,
    unstable_incrementalResolution:false, unstable_logWarning:()=>{},
  };
}
for (const platform of ['web','android']) {
  test(`Metro resolves shared .js imports to platform TypeScript on ${platform}`, () => {
    const platformFile=`src/tools/types.${platform}.ts`;
    const ctx=context(['src/tools/types.ts',platformFile]);
    assert.deepEqual(withSharedTypeScript(root)(ctx,'./types.js',platform), {type:'sourceFile',filePath:path.join(root,platformFile)});
  });
}
test('Metro keeps an existing JS file ahead of the TS fallback', () => {
  const ctx=context(['src/tools/types.js','src/tools/types.ts']);
  assert.deepEqual(withSharedTypeScript(root)(ctx,'./types.js','web'), {type:'sourceFile',filePath:path.join(root,'src/tools/types.js')});
});
test('Metro resolves TSX and passes through a previous resolver', () => {
  let calls=0;
  const previous:CustomResolver=(ctx,name,platform)=>{calls++;return metroResolve(ctx,name,platform);};
  const ctx=context(['src/tools/view.tsx']);
  assert.deepEqual(withSharedTypeScript(root,previous)(ctx,'./view.js','android'), {type:'sourceFile',filePath:path.join(root,'src/tools/view.tsx')});
  assert.equal(calls,2);
});
test('Metro never remaps dependency internals, bare packages or paths outside source roots', () => {
  const failure=new Error('original resolution failure');
  for (const [from,name] of [[path.join(root,'mobile/node_modules/pkg/index.js'),'./types.js'],[origin,'package.js'],[origin,'../../elsewhere.js']]) {
    let calls=0;
    const ctx={...context([],from),resolveRequest:()=>{calls++;throw failure;}};
    assert.throws(()=>withSharedTypeScript(root)(ctx,name!,'web'), error=>error===failure);
    assert.equal(calls,1);
  }
});
test('Metro preserves the original error when both extensions are missing', () => {
  const failure=new Error('original');let calls=0;
  const ctx={...context([]),resolveRequest:()=>{calls++;throw calls===1?failure:new Error('fallback');}};
  assert.throws(()=>withSharedTypeScript(root)(ctx,'./missing.js','web'), error=>error===failure);
});
