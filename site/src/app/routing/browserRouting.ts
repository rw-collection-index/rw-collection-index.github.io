/**
 * Browser-side edge of the routing layer. This is the ONLY routing file allowed
 * to touch `window`, `history` and `process.env`. It injects the public base
 * path (PUBLIC_URL) around the pure, base-relative functions in routes.ts.
 */

import {
    RouteParams,
    buildRoute,
    buildRoutePath,
    parseRoutePath,
    parseLegacyParams,
} from './routes';

/** public base path, no trailing slash ("" at root) */
export const BASE_PATH = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');

/** Remove the base path prefix from a full pathname, yielding a base-relative path. */
export function stripBase(pathname: string): string {
    if (BASE_PATH && pathname.startsWith(BASE_PATH)) {
        return pathname.slice(BASE_PATH.length) || '/';
    }
    return pathname || '/';
}

/** A full, navigable href (base + route) for the given params. */
export function routeHref(params: RouteParams): string {
    return BASE_PATH + buildRoute(params);
}

/**
 * The full href of a dataset's root (e.g. "/" or "/modded/", plus any base
 * path). Switching datasets is a real navigation (different data is
 * fetched at bootstrap), so callers assign this to window.location.href.
 */
export function datasetRootHref(datasetKey: string): string {
    return routeHref({ datasetKey, entryId: null, transcriberName: null, source: null });
}

/** Parse the current window location into RouteParams. */
export function currentRouteParams(): RouteParams {
    return parseRoutePath(stripBase(window.location.pathname), window.location.search);
}

/** Parse any legacy query-param URL currently in the address bar (or null). */
export function currentLegacyParams(): RouteParams | null {
    return parseLegacyParams(window.location.search);
}

/** Replace the current history entry with the canonical route for these params. */
export function replaceRoute(params: RouteParams): void {
    const href = routeHref(params);
    if (href !== window.location.pathname + window.location.search) {
        window.history.replaceState(null, '', href);
    }
}

/**
 * Point the <link rel="canonical"> at the current transcriber's own URL, dropping only the source query so source variants don't fragment indexing.
 * Each transcriber page is its own canonical; the bare entry alias resolves to the default transcriber, matching the static canonical the build writes.
 */
export function updateCanonicalTag(params: RouteParams): void {
    const canonicalParams: RouteParams = {
        datasetKey: params.datasetKey,
        entryId: params.entryId,
        transcriberName: params.transcriberName,
        source: null,
    };
    const href = window.location.origin + BASE_PATH + buildRoutePath(canonicalParams);

    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) {
        link = document.createElement('link');
        link.rel = 'canonical';
        document.head.appendChild(link);
    }
    link.href = href;
}
