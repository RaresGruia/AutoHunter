import type { FastifyInstance } from 'fastify';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';
import { demoImagePathPattern } from '../../models/ListingImages.js';
import { attachDemoImages, readDemoImageManifest, type DemoImageCategory } from '../../services/demoImages.js';

/** Local assets only. No proxy, downloads or directory browsing. Registered only in DEMO. */
export function registerDemoImages(app: FastifyInstance, directory = resolve('fixtures/images'), manifestFile?: string): void {
  app.get<{ Params: { category: string; listingId: string; filename: string } }>('/demo-images/:category/:listingId/:filename', async (request, reply) => {
    const { category, listingId, filename } = request.params;
    if (!demoImagePathPattern.test(`/demo-images/${category}/${listingId}/${filename}`)) return reply.code(404).send();
    try {
      const listing=attachDemoImages({id:listingId,imageUrls:[] as string[],thumbnailUrl:null as string|null},category as DemoImageCategory,await readDemoImageManifest(manifestFile));
      const assetUrl=`/demo-images/${category}/${listingId}/${filename}`;
      if(![...listing.imageUrls,listing.thumbnailUrl].includes(assetUrl))return reply.code(404).send();
      const root = await realpath(directory);
      const file = await realpath(resolve(root, category, listingId, filename));
      if (!file.startsWith(`${root}${sep}`)) return reply.code(404).send();
      const info = await stat(file);
      if (!info.isFile() || info.size > 10 * 1024 * 1024) return reply.code(404).send();
      const types: Record<string, string> = { '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.webp':'image/webp' };
      return reply.type(types[extname(file).toLowerCase()]!).header('X-Content-Type-Options', 'nosniff')
        .header('Cache-Control', 'no-cache').send(await readFile(file));
    } catch (error) {
      if (['ENOENT','ENOTDIR','EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')) return reply.code(404).send();
      throw error;
    }
  });
}
