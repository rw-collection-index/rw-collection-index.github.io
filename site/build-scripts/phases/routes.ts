/**
 * Phase: static route generation.
 * Runs after the app bundle exists.
 * Produces a real index.html for every entry and transcriber (with per-page meta, canonical and crawlable content), the dataset landing pages, 404.html, sitemap.xml, sitemap.txt, robots.txt and routes.json.
 * It shares routes.ts with the app, so build and runtime URLs cannot diverge, and asserts every route round-trips so a missed entry fails loudly.
 *
 * in   build/index.html (shell), public/data/parsed-dialogues*.json
 * out  build/**\/index.html, build/404.html, build/{sitemap.xml,sitemap.txt,robots.txt,routes.json}
 */

import * as crypto from 'crypto';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

import {
    BASE,
    BUILD_DIR,
    DATASETS,
    deployImageFormat,
    dialogueDirOf,
    parsedDialoguesFile,
    ROOT_DIR
} from '../lib/config';
import { readText, writeJson, writeText } from '../lib/io';
import { phase } from '../lib/log';
import type { RouteDescriptor } from '../../src/app/routing/routes';
import {
    buildRoutePath,
    defaultTranscriberName,
    entryIdForPearl,
    enumerateRoutes,
    parseRoutePath,
    renderRouteContent,
    resolveRoute,
    SITE_NAME,
    validateDatasets,
} from '../../src/app/routing/routes';
import type { PearlData } from '../../src/app/types/types';
import { SITE_URL, DEFAULT_OG_IMAGE } from '../../src/app/config/site';

const DEFAULT_TITLE = `${SITE_NAME} | Pearls, Broadcasts, Downpour & The Watcher DLC`;
const DEFAULT_DESCRIPTION =
    'Explore and track all Pearls, Broadcasts, Downpour and The Watcher DLC content, Iterator dialogues, ' +
    'Echoes and more from the game Rain World in your browser. Full-text search, view interactive map ' +
    'locations and use the spoiler protection functionality.';

const DATASET_BOOTSTRAP = DATASETS.map(d => ({ prefix: d.routePrefix, key: d.key, suffix: d.jsonSuffix }));

function xmlEscape(value: string): string {
    return value
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function htmlAttrEscape(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function absoluteUrl(routePath: string): string {
    return SITE_URL + routePath;
}

function toAbsoluteOg(ogImage: string): string {
    if (/^https?:\/\//.test(ogImage)) return ogImage;
    return SITE_URL + (ogImage.startsWith('/') ? ogImage : '/' + ogImage);
}

/**
 * Provide the dataset registry to the pre-bundle bootstrap by injecting a fresh <script> that sets
 * window.__RW_DATASETS__ before the bootstrap runs (CRA mangles the inline script, so it cannot be rewritten in place).
 */
function injectDatasetRegistry(html: string): string {
    const script = `<script>window.__RW_DATASETS__=${JSON.stringify(DATASET_BOOTSTRAP)};</script>`;
    const charset = /<meta\s+charset="[^"]*"\s*\/?>/i;
    if (charset.test(html)) return html.replace(charset, match => match + script);
    const head = /<head[^>]*>/i;
    if (head.test(html)) return html.replace(head, match => match + script);
    throw new Error('Could not find <head> to inject the dataset registry into.');
}

interface PageMeta {
    title: string;
    description: string;
    canonicalUrl: string;
    ogUrl: string;
    ogImage: string;
}

function applyMeta(html: string, meta: PageMeta): string {
    const title = htmlAttrEscape(meta.title);
    const description = htmlAttrEscape(meta.description);

    const replacements: Array<[RegExp, string]> = [
        [/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`],
        [/<meta name="description"[^>]*>/, `<meta name="description" content="${description}"/>`],
        [/<meta property="og:title"[^>]*>/, `<meta property="og:title" content="${title}"/>`],
        [/<meta property="og:description"[^>]*>/, `<meta property="og:description" content="${description}"/>`],
        [/<meta property="og:url"[^>]*>/, `<meta property="og:url" content="${htmlAttrEscape(meta.ogUrl)}"/>`],
        [/<meta property="og:image"[^>]*>/, `<meta property="og:image" content="${htmlAttrEscape(meta.ogImage)}"/>`],
        [/<meta property="twitter:title"[^>]*>/, `<meta property="twitter:title" content="${title}"/>`],
        [/<meta property="twitter:description"[^>]*>/, `<meta property="twitter:description" content="${description}"/>`],
        [/<meta property="twitter:url"[^>]*>/, `<meta property="twitter:url" content="${htmlAttrEscape(meta.ogUrl)}"/>`],
        [/<meta property="twitter:image"[^>]*>/, `<meta property="twitter:image" content="${htmlAttrEscape(meta.ogImage)}"/>`],
        [/<link rel="canonical"[^>]*>/, `<link rel="canonical" href="${htmlAttrEscape(meta.canonicalUrl)}"/>`],
    ];

    let result = html;
    for (const [pattern, replacement] of replacements) result = result.replace(pattern, replacement);
    return result;
}


const STATIC_NAV_STYLE = 'font-size:0.75rem;color:#888;padding:0.75rem 2rem;border-top:1px solid #222;background:#0c0c0c;font-family:sans-serif';
const STATIC_NAV_SUMMARY_STYLE = 'cursor:pointer;list-style:none;color:#666';
const STATIC_NAV_LINK_STYLE = 'color:#aaa;text-decoration:none';
const STATIC_NAV_LIST_STYLE = 'margin-top:0.4rem;display:flex;flex-wrap:wrap;gap:0.2rem 0.6rem';

/** Visible <details> link tree injected before </body>, outside #root, for crawler link discovery. */
function injectStaticNav(html: string, detailsHtml: string): string {
    if (!detailsHtml) return html;
    return html.replace('</body>', `${detailsHtml}</body>`);
}

function buildDatasetNav(pearls: PearlData[], datasetKey: string, otherDatasets: Array<{ href: string; label: string }>): string {
    const otherLinks = otherDatasets.map(({ href, label }) =>
        `<a href="${htmlAttrEscape(href)}" style="${STATIC_NAV_LINK_STYLE}">${htmlAttrEscape(label)}</a>`
    ).join('');
    const entryLinks = pearls.map(pearl => {
        const entryId = entryIdForPearl(pearl, pearls);
        const href = htmlAttrEscape(BASE + buildRoutePath({ datasetKey, entryId, transcriberName: defaultTranscriberName(pearl), source: null }));
        const label = htmlAttrEscape(pearl.metadata.name || entryId);
        return `<a href="${href}" style="${STATIC_NAV_LINK_STYLE}">${label}</a>`;
    }).join('');
    return `<details id="rw-static-index" style="${STATIC_NAV_STYLE}"><summary style="${STATIC_NAV_SUMMARY_STYLE}">Site index</summary><nav style="${STATIC_NAV_LIST_STYLE}">${otherLinks}${entryLinks}</nav></details>`;
}

function buildEntryDetails(summaryLabel: string, transcribers: RouteDescriptor[], contentHtml: string, datasetRootHref: string): string {
    const rootLink = `<a href="${htmlAttrEscape(datasetRootHref)}" style="${STATIC_NAV_LINK_STYLE}">All entries</a>`;
    const transcriberLinks = transcribers.map(r => {
        const href = htmlAttrEscape(BASE + r.path);
        const label = htmlAttrEscape(r.transcriberName ?? r.entryId);
        return `<a href="${href}" style="${STATIC_NAV_LINK_STYLE}">${label}</a>`;
    }).join('');
    const navHtml = `<nav style="${STATIC_NAV_LIST_STYLE}">${rootLink}${transcriberLinks}</nav>`;
    const articleHtml = contentHtml ? `<article style="margin-top:0.75rem;color:#bbb;line-height:1.5">${contentHtml}</article>` : '';
    return `<details id="rw-static-index" style="${STATIC_NAV_STYLE}"><summary style="${STATIC_NAV_SUMMARY_STYLE}">${htmlAttrEscape(summaryLabel)}</summary>${navHtml}${articleHtml}</details>`;
}

/** Write an HTML page at a base-relative route path (e.g. "/CC/" -> build/CC/index.html). */
function writePage(routePath: string, html: string): string {
    const relative = routePath.replace(/^\/+/, '');
    const file = path.join(relative ? path.join(BUILD_DIR, relative) : BUILD_DIR, 'index.html');
    writeText(file, html);
    return file;
}

function loadPearls(dataset: (typeof DATASETS)[number]): PearlData[] {
    return JSON.parse(readText(parsedDialoguesFile(dataset))) as PearlData[];
}

/** Verify a route survives a full parse -> resolve trip back to the same content. */
function assertRoundTrip(route: RouteDescriptor, pearls: PearlData[]): void {
    const parsed = parseRoutePath(route.path);
    if (parsed.datasetKey !== route.datasetKey) {
        throw new Error(`Route "${route.path}" parsed to dataset "${parsed.datasetKey}", expected "${route.datasetKey}".`);
    }
    if (parsed.entryId !== route.entryId) {
        throw new Error(`Route "${route.path}" entryId did not round-trip: "${parsed.entryId}" != "${route.entryId}".`);
    }
    const resolved = resolveRoute(parsed, pearls);
    if (!resolved) throw new Error(`Route "${route.path}" does not resolve back to any pearl.`);
    if (resolved.pearl.id !== route.pearlId) {
        throw new Error(`Route "${route.path}" resolves to pearl "${resolved.pearl.id}", expected "${route.pearlId}".`);
    }
    if (route.transcriberName && resolved.transcriberName !== route.transcriberName) {
        throw new Error(`Route "${route.path}" round-trip mismatch: expected transcriber "${route.transcriberName}", got "${resolved.transcriberName}".`);
    }
}

/** HEAD commit time (ISO 8601), the sitemap fallback for routes with no tracked source file (landing pages, uncommitted .txt). */
function deployLastmod(): string {
    try {
        return execSync('git log -1 --format=%cI', { encoding: 'utf8', cwd: ROOT_DIR }).trim();
    } catch {
        return new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    }
}

const CONTENT_TIMESTAMPS_FILE = path.join(__dirname, '..', 'content-timestamps.json');

interface TimestampEntry { hash: string; lastmod: string; }

function gitLastmodForFile(relToRoot: string): string | undefined {
    try {
        const out = execSync(`git log -1 --format=%cI -- "${relToRoot}"`, { encoding: 'utf8', cwd: ROOT_DIR }).trim();
        return out || undefined;
    } catch {
        return undefined;
    }
}

/** Read the stored manifest, hash each source file, keep stored lastmod on match, query git on change/new, write back. */
function contentHashLastmodMap(sourceFilesRelToRoot: string[]): Map<string, string> {
    let stored: Record<string, TimestampEntry> = {};
    try { stored = JSON.parse(fs.readFileSync(CONTENT_TIMESTAMPS_FILE, 'utf8')); } catch { }

    const result = new Map<string, string>();
    const updated: Record<string, TimestampEntry> = {};

    for (const rel of sourceFilesRelToRoot) {
        // normalize CRLF -> LF before hashing so the cache key matches on Windows (CRLF) and CI (LF)
        const content = fs.readFileSync(path.join(ROOT_DIR, rel), 'latin1').replace(/\r/g, '');
        const hash = crypto.createHash('sha256').update(content, 'latin1').digest('hex');
        const lastmod = stored[rel]?.hash === hash ? stored[rel].lastmod : gitLastmodForFile(rel);
        if (lastmod) {
            updated[rel] = { hash, lastmod };
            result.set(rel, lastmod);
        }
    }

    const sorted = Object.fromEntries(Object.entries(updated).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(CONTENT_TIMESTAMPS_FILE, JSON.stringify(sorted, null, 2) + '\n', 'utf8');

    return result;
}

function writeSitemapTxt(entries: Array<{ path: string }>): void {
    writeText(
        path.join(BUILD_DIR, 'sitemap.txt'),
        entries.map(({ path: routePath }) => absoluteUrl(routePath)).join('\n') + '\n',
    );
}

function writeSitemapXml(entries: Array<{ path: string; lastmod: string }>): void {
    const urls = entries.map(({ path: routePath, lastmod }) => {
        const loc = xmlEscape(absoluteUrl(routePath));
        return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`;
    }).join('\n');
    writeText(
        path.join(BUILD_DIR, 'sitemap.xml'),
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`,
    );
}

function writeRobots(): void {
    writeText(
        path.join(BUILD_DIR, 'robots.txt'),
        `# https://www.robotstxt.org/robotstxt.html\nUser-agent: *\nDisallow:\n\nSitemap: ${SITE_URL}/sitemap.xml\nSitemap: ${SITE_URL}/sitemap.txt\n`,
    );
}

export function runRoutes(): void {
    const log = phase('routes');

    const indexPath = path.join(BUILD_DIR, 'index.html');
    if (!fs.existsSync(indexPath)) {
        throw new Error(`Build shell not found at ${indexPath}. Run the bundle phase first.`);
    }
    log.reads('build/index.html (shell), public/data/parsed-dialogues*.json');

    const imageFormat = deployImageFormat();
    const shell = injectDatasetRegistry(readText(indexPath));
    const datasetPearls = DATASETS.map(d => ({ dataset: d, pearls: loadPearls(d) }));

    const validationErrors = validateDatasets(
        datasetPearls.map(({ dataset, pearls }) => ({ datasetKey: dataset.key, pearls })),
    );
    if (validationErrors.length) {
        throw new Error('Route validation failed:\n  - ' + validationErrors.join('\n  - '));
    }

    const writtenFiles = new Set<string>();
    const manifest: Array<{
        path: string;
        datasetKey: string;
        entryId: string;
        transcriberName: string | null;
        canonical: boolean
    }> = [];
    const sitemapEntries: Array<{ path: string; lastmod: string }> = [];

    const headDate = deployLastmod();
    const allSourceFiles = [...new Set(datasetPearls.flatMap(({ pearls }) => pearls.map(p => p.sourceFile).filter((s): s is string => !!s)))];
    const contentDates = contentHashLastmodMap(allSourceFiles);
    const lastmodFor = (sourceFile?: string) => (sourceFile && contentDates.get(sourceFile)) || headDate;

    for (const { dataset, pearls } of datasetPearls) {
        const routePath = '/' + (dataset.routePrefix ? dataset.routePrefix + '/' : '');
        const meta: PageMeta = {
            title: DEFAULT_TITLE,
            description: DEFAULT_DESCRIPTION,
            canonicalUrl: absoluteUrl(routePath),
            ogUrl: absoluteUrl(routePath),
            ogImage: DEFAULT_OG_IMAGE,
        };
        const otherDatasets = datasetPearls
            .filter(dp => dp.dataset.key !== dataset.key)
            .map(dp => ({
                href: BASE + '/' + (dp.dataset.routePrefix ? dp.dataset.routePrefix + '/' : ''),
                label: dp.dataset.key.charAt(0).toUpperCase() + dp.dataset.key.slice(1) + ' entries',
            }));
        writtenFiles.add(writePage(routePath, applyMeta(injectStaticNav(shell, buildDatasetNav(pearls, dataset.key, otherDatasets)), meta)));
        sitemapEntries.push({ path: routePath, lastmod: headDate });
    }

    for (const { dataset, pearls } of datasetPearls) {
        // Key by the same url id the routes use (internalId-preferring), not pearl.id, or lookups silently miss.
        const sourceByEntryId = new Map(pearls.map(p => [entryIdForPearl(p, pearls), p.sourceFile]));
        const routes = enumerateRoutes(dataset.key, pearls);

        const pearlTranscribers = new Map<string, RouteDescriptor[]>();
        for (const r of routes) {
            if (r.transcriberName !== null) {
                const list = pearlTranscribers.get(r.pearlId) ?? [];
                list.push(r);
                pearlTranscribers.set(r.pearlId, list);
            }
        }

        const datasetRootHref = BASE + '/' + (dataset.routePrefix ? dataset.routePrefix + '/' : '');

        for (const route of routes) {
            assertRoundTrip(route, pearls);

            const meta: PageMeta = {
                title: route.title,
                description: route.description,
                canonicalUrl: absoluteUrl(route.canonicalPath),
                ogUrl: absoluteUrl(route.path),
                ogImage: route.ogImage ? toAbsoluteOg(route.ogImage) : DEFAULT_OG_IMAGE,
            };

            const pearl = pearls.find(p => p.id === route.pearlId)!;
            const contentHtml = renderRouteContent(route, pearls, BASE, imageFormat);
            const entryDetails = buildEntryDetails(pearl.metadata.name || route.entryId, pearlTranscribers.get(route.pearlId) ?? [], contentHtml, datasetRootHref);
            const file = writePage(route.path, applyMeta(injectStaticNav(shell, entryDetails), meta));
            if (writtenFiles.has(file)) throw new Error(`Two routes resolved to the same file: ${file}`);
            writtenFiles.add(file);

            manifest.push({
                path: route.path,
                datasetKey: route.datasetKey,
                entryId: route.entryId,
                transcriberName: route.transcriberName,
                canonical: route.isCanonical,
            });
            // Only canonical pages belong in the sitemap; the bare entry alias points its rel=canonical at the default transcriber.
            if (route.isCanonical) {
                sitemapEntries.push({ path: route.path, lastmod: lastmodFor(sourceByEntryId.get(route.entryId)) });
            }
        }
    }

    const notFound = shell.replace(
        '<div id="root"></div>',
        '<div id="root"></div>\n<script>window.__RW_FROM_404__ = true;</script>',
    );
    writeText(path.join(BUILD_DIR, '404.html'), applyMeta(notFound, {
        title: DEFAULT_TITLE,
        description: DEFAULT_DESCRIPTION,
        canonicalUrl: absoluteUrl('/'),
        ogUrl: absoluteUrl('/'),
        ogImage: DEFAULT_OG_IMAGE,
    }));

    writeSitemapXml(sitemapEntries);
    writeSitemapTxt(sitemapEntries);
    writeRobots();
    writeJson(path.join(BUILD_DIR, 'routes.json'), manifest);

    const expected = manifest.length + datasetPearls.length;
    if (writtenFiles.size !== expected) {
        throw new Error(`Route count mismatch: wrote ${writtenFiles.size} pages but expected ${expected}.`);
    }

    log.writes(`${writtenFiles.size} HTML pages, 404.html, sitemap.xml, sitemap.txt, robots.txt, routes.json`);
    log.done(`${manifest.length} routes across ${DATASETS.length} datasets, images=${imageFormat}`);
}
