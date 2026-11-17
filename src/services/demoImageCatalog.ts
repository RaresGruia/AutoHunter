import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { canDisplayImages, imageMetadata, type ImageRights, type ListingImages } from '../models/ListingImages.js';
import type { DemoImageCategory, DemoImageManifest } from './demoImages.js';

export interface ImageCatalogListing { category: DemoImageCategory; id: string; title: string; kind: string }
export interface ImageDiagnostic extends ImageCatalogListing {
  directory: string;
  files: string[];
  photos: number;
  displayable: boolean;
  issues: string[];
}

/** Read local assets only. Never grant rights, download files or fabricate pictures. */
export async function scanDemoImages(imageRoot: string, listings: ImageCatalogListing[]) {
  const root = await realpath(imageRoot);
  const manifest: DemoImageManifest = {};
  const diagnostics: ImageDiagnostic[] = [];
  for (const listing of listings) {
    if (!['cars','tractors','tools'].includes(listing.category) || !/^[a-z0-9_-]+$/i.test(listing.id)) throw Error('Unsafe DEMO listing ID');
    const directory = `${listing.category}/${listing.id}`;
    const folder = resolve(root, directory);
    const issues: string[] = [];
    let files: string[] = [];
    try {
      if (!(await realpath(folder)).startsWith(root + sep)) throw Error('Image folder must stay inside fixtures/images');
      files = (await readdir(folder, {withFileTypes:true})).filter(entry => entry.isFile()).map(entry => entry.name).sort();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const numbered = /^(?:0[1-9]|[1-9][0-9])\.(jpg|jpeg|png|webp)$/;
    const thumbnail = /^thumbnail\.(jpg|jpeg|png|webp)$/;
    const imageFiles = files.filter(name => numbered.test(name) || thumbnail.test(name));
    if (files.some(name => /\.(jpg|jpeg|png|webp|gif|heic|avif)$/i.test(name) && !imageFiles.includes(name))) issues.push('INVALID_FILENAMES');
    const stems = imageFiles.map(name => name.split('.')[0]);
    const duplicates = new Set(stems.filter((stem, index) => stems.indexOf(stem) !== index));
    if (duplicates.size) issues.push('DUPLICATE_IMAGE_NUMBER');
    const usable: string[] = [];
    for (const name of imageFiles) {
      const info = await stat(resolve(folder, name));
      if (!info.size || info.size > 10 * 1024 * 1024) { issues.push('INVALID_IMAGE_SIZE'); continue; }
      if (!duplicates.has(name.split('.')[0])) usable.push(name);
    }
    const names = usable.filter(name => numbered.test(name));
    if (!names.length) issues.push('MISSING_PHOTOS');
    let imageRights: ImageRights = {status:'UNKNOWN', evidence:null};
    let metadata: Pick<ListingImages, 'imagePresentation' | 'imageAttributions'> = {};
    if (!files.includes('rights.json')) issues.push('MISSING_RIGHTS');
    else {
      try {
        const rights: unknown = JSON.parse(await readFile(resolve(folder, 'rights.json'), 'utf8'));
        if (rights && typeof rights === 'object' && canDisplayImages(rights as ImageRights)) {
          const granted = rights as ImageRights;
          imageRights = {status:granted.status, evidence:granted.evidence!.trim()};
          metadata = imageMetadata(rights);
        } else issues.push('UNCONFIRMED_RIGHTS');
      } catch { issues.push('INVALID_RIGHTS_JSON'); }
    }
    const url = (name: string) => `/demo-images/${directory}/${name}`;
    const thumb = usable.find(name => thumbnail.test(name));
    manifest[listing.category] ??= {};
    manifest[listing.category]![listing.id] = {
      imageUrl:names[0] ? url(names[0]) : null, imageUrls:names.map(url),
      thumbnailUrl:thumb ? url(thumb) : null, imageRights,
      ...metadata,
    };
    diagnostics.push({...listing, directory, files, photos:names.length,
      displayable:names.length > 0 && canDisplayImages(imageRights), issues:[...new Set(issues)]});
  }
  return {manifest, diagnostics};
}
