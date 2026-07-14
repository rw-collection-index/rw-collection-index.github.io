/**
 * Shared configuration for the build pipeline.
 * Every absolute path the build touches is derived here from this file's own location, so the phases never compute paths themselves.
 */

import * as fs from 'fs';
import * as path from 'path';

import { DATASETS, DEFAULT_DATASET_KEY } from '../../src/app/routing/datasets';
import { COMPRESSED_IMG_DIRS } from '../../src/app/utils/assetUtils';

export { DATASETS, DEFAULT_DATASET_KEY };
export type Dataset = (typeof DATASETS)[number];

/** site/ (the CRA project root). */
export const SITE_DIR = path.resolve(__dirname, '..', '..');
/** Repository root (parent of site/). */
export const ROOT_DIR = path.resolve(SITE_DIR, '..');

export const BUILD_DIR = path.join(SITE_DIR, 'build');
export const PUBLIC_DIR = path.join(SITE_DIR, 'public');
export const DATA_DIR = path.join(PUBLIC_DIR, 'data');
export const PUBLIC_IMG_DIR = path.join(PUBLIC_DIR, 'img');
export const BUILD_COMPRESS_IMG_DIRS = COMPRESSED_IMG_DIRS.map(dir => path.join(BUILD_DIR, 'img', dir));

export const pkg = JSON.parse(fs.readFileSync(path.join(SITE_DIR, 'package.json'), 'utf8'));

/** public base path from package.json "homepage", no trailing slash ("" at root) */
export const BASE = String(pkg.homepage || '/').replace(/\/+$/, '');

/** Absolute path to a dataset's dialogue source folder (its dialogueDir is relative to site/). */
export function dialogueDirOf(dataset: Dataset): string {
    return path.resolve(SITE_DIR, dataset.dialogueDir);
}

/** Generated data file for a dataset, e.g. public/data/parsed-dialogues-modded.json. */
export function parsedDialoguesFile(dataset: Dataset): string {
    return path.join(DATA_DIR, `parsed-dialogues${dataset.jsonSuffix}.json`);
}

/** Copied game source dump for a dataset, e.g. public/data/source-decrypted-modded.json. */
export function sourceDecryptedFile(dataset: Dataset): string {
    return path.join(DATA_DIR, `source-decrypted${dataset.jsonSuffix}.json`);
}

/**
 * Image format the deployed app and generated HTML should point at.
 * Set by the bundle phase (as REACT_APP_IMG_FORMAT) so the JS bundle, the static HTML and the on-disk files all agree.
 * "webp" means the image phase has rewritten build/img to WebP.
 */
export function deployImageFormat(): 'webp' | 'original' {
    return process.env.REACT_APP_IMG_FORMAT === 'webp' ? 'webp' : 'original';
}
