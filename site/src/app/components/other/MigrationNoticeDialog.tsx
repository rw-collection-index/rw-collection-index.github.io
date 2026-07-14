import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { RwIconButton } from './RwIconButton';
import { RwAsset } from "./RwAsset";

const SEEN_KEY = 'rw-migration-notice-seen';
const OLD_ORIGIN = 'yanwittmann.github.io';
const OLD_SITE_URL = 'https://yanwittmann.github.io/rw-collection-index';

export function MigrationNoticeDialog() {
    const [open, setOpen] = useState(false);
    const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

    useEffect(() => {
        try {
            if (localStorage.getItem(SEEN_KEY)) return;
            if (!document.referrer.includes(OLD_ORIGIN)) return;
            localStorage.setItem(SEEN_KEY, 'true');
            setOpen(true);
        } catch {
        }
    }, []);

    useEffect(() => {
        if (!open) return;
        const div = document.createElement('div');
        document.body.appendChild(div);
        setPortalRoot(div);
        return () => {
            document.body.removeChild(div);
        };
    }, [open]);

    const close = () => setOpen(false);
    useEscapeKey(close, open);

    if (!open || !portalRoot) return null;

    const newUrl = window.location.origin + window.location.pathname;
    const oldUrl = OLD_SITE_URL + window.location.pathname;

    return createPortal(
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
             onClick={(e) => {
                 if (e.target === e.currentTarget) close();
             }}>
            <div
                className="bg-black border-2 border-white/80 rounded-xl shadow-[0_0_10px_rgba(255,255,255,0.1)] w-full max-w-lg flex flex-col text-white">
                <div className="flex justify-between items-center py-4 px-5 border-b border-white/20">
                    <h2 className="text-white font-medium flex gap-3 items-center"><RwAsset src="The_Scholar_Square" className="w-7 h-7"/> The Collection Index has moved</h2>
                </div>
                <div className="flex flex-col gap-4 px-5 py-4 text-sm text-white/90">
                    <p>
                        It now has its own dedicated address instead of being hosted under a personal account.
                        The old link still works, but going forward this is the one to bookmark and share:
                    </p>
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-1.5 bg-green-500/10 border border-green-500/50 rounded-lg px-3 py-2.5">
                            <div className="text-[10px] font-medium tracking-wide text-green-400/80 uppercase">You were redirected to this new URL</div>
                            <div className="font-mono text-sm text-white break-all">{newUrl}</div>
                        </div>
                        <div className="text-xs text-white/30 break-all line-through">{oldUrl}</div>
                    </div>
                    <div className="flex justify-end">
                        <RwIconButton square={false} aria-label="Got it" onClick={close}>
                            Got it!
                        </RwIconButton>
                    </div>
                </div>
            </div>
        </div>,
        portalRoot
    );
}
