const path = require('node:path');

// Backend NodeNext imports keep their .js extensions. Only Metro adapts them.
function withSharedTypeScript(repositoryRoot, previousResolver) {
  const sourceRoots = [path.join(repositoryRoot, 'src'), path.join(repositoryRoot, 'mobile', 'src')];
  const isSource = file => sourceRoots.some(root => {
    const relative = path.relative(root, file);
    return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  });
  return (context, moduleName, platform) => {
    const resolve = previousResolver ?? context.resolveRequest;
    try {
      return resolve(context, moduleName, platform);
    } catch (originalError) {
      const relative = moduleName.startsWith('./') || moduleName.startsWith('../');
      if (!relative || !moduleName.endsWith('.js') || !isSource(context.originModulePath) ||
          !isSource(path.resolve(path.dirname(context.originModulePath), moduleName))) throw originalError;
      // Let Metro retain .android/.native/.web precedence and its TS/TSX order.
      try {
        return resolve(context, moduleName.slice(0, -3), platform);
      } catch {
        throw originalError;
      }
    }
  };
}
module.exports = { withSharedTypeScript };
