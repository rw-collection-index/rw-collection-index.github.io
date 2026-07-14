export type AssetTint =
    | { mode: "mask"; color: string }
    | { mode: "natural" }

export interface GameAsset {
    src: string
    tint?: AssetTint
    fit?: "fill" | "cover" | "contain"
}

export const Tint = {
    mask: (color: string | undefined): AssetTint | undefined => color ? { mode: "mask", color } : undefined,
    natural: (): AssetTint => ({ mode: "natural" }),
} as const

// The public base path, empty ("") at the root deploy and in dev, or a "/segment" when served under a subpath.
// All asset URLs are made absolute-from-base so they resolve correctly at any route depth (e.g. on /CC/moon/), which relative paths would not.
const ASSET_BASE = (process.env.PUBLIC_URL || '').replace(/\/+$/, '')

// img/ subdirectories the build re-encodes to WebP.
// Add a directory here and the build, runtime URLs and static HTML all follow.
// Only these are rewritten; dev (no env var) keeps serving the original .png on disk.
export const COMPRESSED_IMG_DIRS = ['PearlReader']

export function isCompressedImgPath(relativeToImg: string): boolean {
    return COMPRESSED_IMG_DIRS.some(dir => relativeToImg.startsWith(`${dir}/`))
}

const IMAGE_FORMAT = process.env.REACT_APP_IMG_FORMAT === 'webp' ? 'webp' : 'original'

function applyImageFormat(path: string): string {
    if (IMAGE_FORMAT !== 'webp' || !path.startsWith('img/') || !isCompressedImgPath(path.slice('img/'.length))) return path
    return path.replace(/\.(png|jpe?g)$/i, '.webp')
}

/** Turn a public-folder relative path (e.g. "img/foo.png") into a base-absolute URL. */
export function assetUrl(relativePath: string): string {
    return `${ASSET_BASE}/${applyImageFormat(relativePath.replace(/^\/+/, ''))}`
}

export function resolveAssetUrl(src: string): string {
    const filename = src.split('/').pop() ?? src
    return assetUrl(`img/${filename.includes('.') ? src : src + '.png'}`)
}
