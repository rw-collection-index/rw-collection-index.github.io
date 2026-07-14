/**
 * Single source of truth for the project's public identity and backends.
 * Centralized so a rebrand, org move, or author rename is a one-file edit.
 * Imported by both the app and build-scripts, so no DOM/Node APIs.
 */

export const GITHUB_REPO = 'rw-collection-index/rw-collection-index.github.io';

export const REPO_URL = `https://github.com/${GITHUB_REPO}`;
export const ISSUES_URL = `${REPO_URL}/issues`;
export const NEW_ISSUE_URL = `${REPO_URL}/issues/new`;
export const PRIVACY_URL = `${REPO_URL}/blob/main/privacy.md`;

// canonical origin, no trailing slash or base path (served at the domain root)
export const SITE_URL = 'https://rw-collection-index.github.io';

// fallback share card for pages without a generated preview
export const DEFAULT_OG_IMAGE = `https://raw.githubusercontent.com/${GITHUB_REPO}/refs/heads/main/doc/rw-collection-index-card-2x.png`;

export const AUTHOR_NAME = 'Yan Wittmann';

// external backend; COUNTAPI_INCREMENT_URL is duplicated in public/index.html, which can't import this
export const API_ORIGIN = 'https://yanwittmann.de';
export const SUBMIT_SAVE_URL = `${API_ORIGIN}/projects/collection-index/api/submit_save.php`;
export const COUNTAPI_INCREMENT_URL = `${API_ORIGIN}/projects/countapi/increment.php`;
