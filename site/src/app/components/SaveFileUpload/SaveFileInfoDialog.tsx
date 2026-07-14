"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { createPortal } from 'react-dom';
import { RwIconButton } from '../other/RwIconButton';
import { RwAsset } from '../other/RwAsset';
import { Tint } from '../../utils/assetUtils';
import { randomColor } from '../../utils/colorUtils';
import { RwCheckbox } from '../other/RwCheckbox';
import { useAppContext } from '../../context/AppContext';
import { SaveMatchSummary } from '../../utils/saveCollectibles';
import { PRIVACY_URL } from '../../config/site';

type UploadState = 'idle' | 'loading-wasm' | 'reading' | 'parsing' | 'done' | 'error';

interface SaveFileInfoDialogProps {
    phase: 'upload' | 'confirm';
    uploadState: UploadState;
    errorMessage: React.ReactNode | null;
    matchSummary: SaveMatchSummary | null;
    onFile: (file: File) => void;
    onConfirm: (donate: boolean, note: string) => void;
    onCancel: () => void;
    onClose: () => void;
}

const pick = <T,>(arr: T[]): T | undefined => arr.length ? arr[Math.floor(Math.random() * arr.length)] : undefined;


function getSavePath(): string | null {
    const ua = navigator.userAgent;
    if (ua.includes('Windows')) return String.raw`%USERPROFILE%\AppData\LocalLow\Videocult\Rain World`;
    if (ua.includes('Mac')) return '~/Library/Application Support/Rain World';
    if (ua.includes('Linux')) return '~/.config/unity3d/Videocult/Rain World';
    return null;
}

export function SaveFileInfoDialog({ phase, uploadState, errorMessage, matchSummary, onFile, onConfirm, onCancel, onClose }: SaveFileInfoDialogProps) {
    const { pearls } = useAppContext();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const innerRef = useRef<HTMLDivElement>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
    const [copied, setCopied] = useState(false);
    const [donate, setDonate] = useState(false);
    const [note, setNote] = useState('');
    const [bodyHeight, setBodyHeight] = useState<number | undefined>(undefined);
    const savePath = useMemo(() => getSavePath(), []);

    useEffect(() => {
        const el = innerRef.current;
        if (!el) return;
        const ro = new ResizeObserver(() => setBodyHeight(el.offsetHeight));
        ro.observe(el);
        setBodyHeight(el.offsetHeight);
        return () => ro.disconnect();
    }, [portalRoot]);

    useEscapeKey(onClose);
    const isLoading = uploadState === 'loading-wasm' || uploadState === 'reading' || uploadState === 'parsing';

    const loadingLabel =
        uploadState === 'loading-wasm' ? 'Loading parser...' :
        uploadState === 'reading' ? 'Reading file...' : 'Parsing save...';

    const icons = useMemo(() => {
        const itemEntry = pick(pearls.filter(p => p.metadata.type === 'item' && p.metadata.subType?.startsWith('item/')));
        return {
            pearlColor: randomColor(),
            broadcastColor: randomColor(),
            itemSubType: itemEntry?.metadata.subType ?? 'pearl',
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const examples = useMemo(() => [
        { label: 'Collected pearl', variant: 'gold' as const, iconType: 'pearl',           color: icons.pearlColor },
        { label: 'Found item',      variant: 'gold' as const, iconType: icons.itemSubType, color: icons.broadcastColor },
        { label: 'Not yet found',   variant: 'default' as const, iconType: 'questionmark', color: undefined },
    ], [icons]);

    const summaryRows = useMemo(() => {
        if (!matchSummary) return [];
        return [
            { count: matchSummary.pearls,     label: 'transcriptions', iconType: 'pearl',           color: icons.pearlColor },
            { count: matchSummary.broadcasts, label: 'broadcasts',     iconType: 'broadcast',       color: icons.broadcastColor },
            { count: matchSummary.echoes,     label: 'echoes',         iconType: 'echo',            color: undefined },
            { count: matchSummary.oracles,    label: 'various',        iconType: icons.itemSubType, color: undefined },
        ].filter(r => r.count > 0);
    }, [matchSummary, icons]);

    useEffect(() => {
        const div = document.createElement('div');
        document.body.appendChild(div);
        setPortalRoot(div);
        return () => { document.body.removeChild(div); };
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file && !isLoading) onFile(file);
    }, [onFile, isLoading]);

    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback(() => setIsDragOver(false), []);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) onFile(file);
        e.target.value = '';
    }, [onFile]);

    if (!portalRoot) return null;

    return createPortal(
        <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="bg-black border-2 border-white/80 rounded-xl shadow-[0_0_10px_rgba(255,255,255,0.1)] w-full max-w-md flex flex-col text-white">
                {/* Header */}
                <div className="flex justify-between items-center py-3 px-5 border-b border-white/20">
                    <h2 className="text-white font-medium">
                        {phase === 'confirm' ? 'Save file loaded' : 'Sync save file unlocks'}
                    </h2>
                    <div className="cursor-pointer w-8 h-8 flex items-center justify-center text-white/60 hover:text-white transition-colors" onClick={onClose}>
                        ✕
                    </div>
                </div>

                <div
                    className="overflow-hidden"
                    style={{ height: bodyHeight !== undefined ? `${bodyHeight}px` : 'auto', transition: 'height 0.22s ease' }}
                >
                <div ref={innerRef}>
                {phase === 'upload' ? (
                    <div className="flex flex-col gap-5 p-6">
                        {/* Drop zone */}
                        <div className="flex flex-col gap-2">
                            <div
                                className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors select-none ${
                                    isLoading
                                        ? 'border-white/20 bg-white/5 cursor-default'
                                        : isDragOver
                                            ? 'border-white/80 bg-white/10 cursor-copy'
                                            : 'border-white/30 hover:border-white/50 hover:bg-white/5 cursor-pointer'
                                }`}
                                onDrop={handleDrop}
                                onDragOver={handleDragOver}
                                onDragLeave={handleDragLeave}
                                onClick={() => { if (!isLoading) fileInputRef.current?.click(); }}
                            >
                                <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
                                {isLoading ? (
                                    <p className="text-white/60 font-medium text-sm animate-pulse">{loadingLabel}</p>
                                ) : (
                                    <>
                                        <p className="text-white font-medium text-sm">Drop your &nbsp;<code>sav</code>&nbsp; file here or click to browse.</p>
                                        <p className="text-white/50 text-xs mt-1">Your save file is processed locally in the browser.</p>
                                    </>
                                )}
                            </div>
                            {savePath && !isLoading && (
                                <p
                                    className={`font-mono text-xs text-center select-text cursor-copy transition-colors ${copied ? 'text-white/70' : 'text-white/50'}`}
                                    onMouseDown={() => {
                                        navigator.clipboard.writeText(savePath).then(() => {
                                            setCopied(true);
                                            setTimeout(() => setCopied(false), 1000);
                                        }).catch(() => {});
                                    }}
                                >
                                    {copied ? 'Copied!' : savePath}
                                </p>
                            )}
                            {errorMessage && (
                                <p className="text-red-400/90 text-xs text-center">{errorMessage}</p>
                            )}
                        </div>

                        {/* Explanation */}
                        <ul className="text-white/90 text-sm space-y-2">
                            <li>Load your save file to highlight which pearls, broadcasts, items and interactions you have already completed.</li>
                            <li>In Spoiler Protection mode, items you have not yet collected remain hidden behind a question mark.</li>
                            <li>Not all entries are supported, as some data is not tracked by the game.</li>
                        </ul>

                        {/* Example icons */}
                        <div className="flex flex-row gap-8 justify-center">
                            {examples.map(({ label, variant, iconType, color }) => (
                                <div key={label} className="flex flex-col items-center gap-2">
                                    <div className="pointer-events-none">
                                        <RwIconButton variant={variant} aria-label={label} selected={false}>
                                            <RwAsset src={iconType} tint={Tint.mask(color)} />
                                        </RwIconButton>
                                    </div>
                                    <span className="text-xs text-white/50">{label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-5 p-6">
                        {/* Summary */}
                        {summaryRows.length > 0 ? (
                            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                {summaryRows.map(({ count, label, iconType, color }) => (
                                    <div key={label} className="flex items-center gap-2">
                                        <div className="shrink-0 w-5 h-5 pointer-events-none">
                                            <RwAsset src={iconType} tint={Tint.mask(color)} />
                                        </div>
                                        <span className="text-sm">
                                            <span className="font-medium">{count}</span> {label}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-white/50 text-sm italic">No entries matched. Your save may be empty or from an unsupported version.</p>
                        )}

                        {/* Donate section */}
                        <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
                            <div className="flex items-center gap-3">
                                <RwCheckbox
                                    checked={donate}
                                    onCheckedChange={setDonate}
                                    size="small"
                                >
                                    <span className="text-sm">Submit save file for parser testing</span>
                                </RwCheckbox>
                                <a
                                    href={PRIVACY_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-white/40 underline hover:text-white/60 transition-colors shrink-0 ml-auto"
                                >
                                    Privacy
                                </a>
                            </div>
                            <div className={`overflow-hidden transition-all duration-200 ${donate ? 'max-h-12 opacity-100' : 'max-h-0 opacity-0'}`}>
                                <input
                                    type="text"
                                    maxLength={400}
                                    placeholder="A few words about your save (optional)"
                                    value={note}
                                    onChange={(e) => setNote(e.target.value)}
                                    className="w-full bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-white/40 transition-colors"
                                />
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 justify-end">
                            <RwIconButton square={false} aria-label="Cancel" onClick={onCancel}>
                                Cancel
                            </RwIconButton>
                            <RwIconButton square={false} variant="gold" aria-label="Apply unlocks" onClick={() => onConfirm(donate, note)}>
                                Apply
                            </RwIconButton>
                        </div>
                    </div>
                )}
                </div>
                </div>
            </div>
        </div>,
        portalRoot
    );
}
