import { ParseFileResult } from '../types/SaveModel';

let readyPromise: Promise<void> | null = null;

export function loadWasm(): Promise<void> {
    if (readyPromise) return readyPromise;
    const p: Promise<void> = new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('WASM load timeout')), 30000);
        document.addEventListener('rwReady', () => {
            clearTimeout(timeout);
            resolve();
        }, { once: true });
        const script = document.createElement('script');
        // strip trailing slash so a root deploy ("/" or "") gives "/wasm/..." not protocol-relative "//wasm/..."
        const base = (process.env.PUBLIC_URL || '').replace(/\/+$/, '');
        script.src = base + '/wasm/rw-save-file-editor.js';
        script.onerror = () => {
            clearTimeout(timeout);
            reject(new Error('Failed to load WASM script'));
        };
        document.head.appendChild(script);
    });
    p.catch(() => { readyPromise = null; });
    readyPromise = p;
    return p;
}

export async function parseSaveFile(xml: string): Promise<ParseFileResult> {
    await loadWasm();
    const raw = (globalThis as any)['rw-save-file-editor'];
    const api = typeof raw?.then === 'function' ? await raw : raw;
    return JSON.parse(api.parseFile(xml)) as ParseFileResult;
}
