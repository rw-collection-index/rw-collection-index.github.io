"use client"

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { PearlData } from "./types/types";
import { useIsMobile } from './hooks/useIsMobile';
import { orderPearls, PEARL_ORDER_CONFIGS } from './utils/pearlOrder';
import { KarmaSpinner } from './components/KarmaSpinner';
import { AppProvider, useAppContext } from './context/AppContext';
import { useUrlSync } from './hooks/useUrlSync';
import { cn } from '@shadcn/lib/utils';
import { SourceDecrypted } from './utils/speakers';
import { generateTintedImage } from './utils/iconUtils';
import { assetUrl } from './utils/assetUtils';
import { buildRouteMetaFor, initTitleContext } from './routing/routes';

// Lazy load UI components
const PearlGrid = React.lazy(() => import('./components/PearlGrid/PearlGrid'));
const DialogueBox = React.lazy(() => import('./components/DialogueBox/DialogueBox').then(module => ({ default: module.DialogueBox })));

const DEFAULT_FAVICON = assetUrl('favicon.svg');

const faviconCache = new Map<string, string>();

const Content: React.FC<{ orderer: (pearls: PearlData[]) => any }> = ({ orderer }) => {
    const isMobile = useIsMobile();
    const { selectedPearlId, selectedPearlData, selectedTranscriberName } = useAppContext();
    useUrlSync();

    useEffect(() => {
        const updateFavicon = (url: string) => {
            const existingLinks = document.querySelectorAll("link[rel*='icon']");
            existingLinks.forEach(link => link.remove());

            const link = document.createElement('link');
            const isSvg = url.endsWith('.svg') || url.startsWith('data:image/svg');
            link.type = isSvg ? 'image/svg+xml' : 'image/png';
            link.rel = 'icon';
            link.href = url;
            document.head.appendChild(link);
        };

        const existingDescription = document.querySelector('meta[name="description"]');
        const existingTitle = document.querySelector('title');
        const existingOgTitle = document.querySelector('meta[property="og:title"]');
        const existingOgDescription = document.querySelector('meta[property="og:description"]');

        if (existingDescription) existingDescription.remove();
        if (existingTitle) existingTitle.remove();
        if (existingOgTitle) existingOgTitle.remove();
        if (existingOgDescription) existingOgDescription.remove();

        // 1. Update Title and Meta Tags (shared with the build via buildRouteMetaFor,
        // so the live page and pre-generated HTML/embeds never disagree).
        if (selectedPearlData) {
            const { title: effectiveTitle, description: effectiveDialogueSummary } =
                buildRouteMetaFor(selectedPearlData, selectedTranscriberName);

            const descriptionMeta = document.createElement('meta');
            descriptionMeta.name = 'description';
            descriptionMeta.content = effectiveDialogueSummary;
            document.head.appendChild(descriptionMeta);

            const titleElement = document.createElement('title');
            titleElement.textContent = effectiveTitle;
            document.head.appendChild(titleElement);

            const ogTitleMeta = document.createElement('meta');
            ogTitleMeta.setAttribute('property', 'og:title');
            ogTitleMeta.content = effectiveTitle;
            document.head.appendChild(ogTitleMeta);

            const ogDescriptionMeta = document.createElement('meta');
            ogDescriptionMeta.setAttribute('property', 'og:description');
            ogDescriptionMeta.content = effectiveDialogueSummary;
            document.head.appendChild(ogDescriptionMeta);
        } else {
            const defaultDescriptionMeta = document.createElement('meta');
            defaultDescriptionMeta.name = 'description';
            defaultDescriptionMeta.content = 'Explore and track all Pearls, Broadcasts, Downpour and The Watcher DLC content, Iterator dialogues, Echoes and more from the game Rain World in your browser. Full-text search, view interactive map locations and use the spoiler protection functionality.';
            document.head.appendChild(defaultDescriptionMeta);

            const defaultTitleElement = document.createElement('title');
            defaultTitleElement.textContent = 'Rain World Collection Index | Pearls, Broadcasts, Downpour & The Watcher DLC';
            document.head.appendChild(defaultTitleElement);

            const defaultOgTitleMeta = document.createElement('meta');
            defaultOgTitleMeta.setAttribute('property', 'og:title');
            defaultOgTitleMeta.content = 'Rain World Collection Index | Pearls, Broadcasts, Downpour & The Watcher DLC';
            document.head.appendChild(defaultOgTitleMeta);

            const defaultOgDescriptionMeta = document.createElement('meta');
            defaultOgDescriptionMeta.setAttribute('property', 'og:description');
            defaultOgDescriptionMeta.content = 'Complete interactive database of Rain World lore. Browse Pearls, Broadcasts, Dialogue, and more with search and spoiler protection.';
            document.head.appendChild(defaultOgDescriptionMeta);
        }

        // 2. Update Favicon
        const debounceTimer = setTimeout(() => {
            if (selectedPearlData) {
                const iconType = selectedPearlData.metadata.type === 'item'
                    ? (selectedPearlData.metadata.subType || 'pearl')
                    : selectedPearlData.metadata.type;
                const iconColor = selectedPearlData.metadata.color || null;

                const cacheKey = `${iconType}:${iconColor}`;
                const cached = faviconCache.get(cacheKey);
                if (cached) {
                    updateFavicon(cached);
                } else {
                    generateTintedImage(iconType, iconColor)
                        .then(dataUrl => {
                            faviconCache.set(cacheKey, dataUrl);
                            updateFavicon(dataUrl);
                        })
                        .catch(err => {
                            console.warn("Failed to generate composite favicon", err);
                            updateFavicon(DEFAULT_FAVICON);
                        });
                }
            } else {
                updateFavicon(DEFAULT_FAVICON);
            }
        }, 300);

        return () => clearTimeout(debounceTimer);

    }, [selectedPearlData, selectedTranscriberName]);

    if (isMobile) {
        return (
            <>
                <div className="w-full h-full" style={selectedPearlId ? { display: "none" } : {}}>
                    <Suspense fallback={<KarmaSpinner/>}>
                        <PearlGrid order={orderer}/>
                    </Suspense>
                </div>
                {selectedPearlId && (
                    <div className="w-full h-full">
                        <Suspense fallback={<KarmaSpinner/>}>
                            <DialogueBox/>
                        </Suspense>
                    </div>
                )}
            </>
        );
    }

    return (
        <Suspense fallback={<KarmaSpinner/>}>
            <div className="flex flex-row gap-5 h-full w-full animate-in fade-in slide-in-from-bottom-4 duration-500">
                <PearlGrid order={orderer}/>
                <DialogueBox/>
            </div>
        </Suspense>
    );
};

export default function DialogueInterface() {
    const isMobile = useIsMobile();
    const [datasetKey, setDatasetKey] = useState<string>('vanilla');
    const [pearls, setPearls] = useState<PearlData[] | null>(null);
    const [sourceData, setSourceData] = useState<SourceDecrypted[]>([]);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Data is preloaded in index.html and exposed via window.__RW_DATA__
        if (typeof window !== 'undefined' && window.__RW_DATA__) {
            const dataPromises = window.__RW_DATA__;

            // Set the key used by the preloader
            setDatasetKey(window.__RW_DATA_KEY__ || 'vanilla');

            // 1. Pearls (Critical)
            dataPromises.pearls
                .then((data: PearlData[]) => {
                    initTitleContext(data);
                    setPearls(data);
                })
                .catch((err: any) => {
                    console.error("Critical: Failed to load pearls", err);
                    setError("Failed to load application data.");
                });

            // 2. Source (Background)
            dataPromises.source
                .then((data: SourceDecrypted[]) => {
                    setSourceData(data);
                })
                .catch((err: any) => {
                    console.warn("Non-critical: Failed to load source", err);
                });
        } else {
            // Fallback if script didn't run (unlikely)
            setError("Data loader not initialized.");
        }
    }, []);

    const configuredOrderPearls = useMemo(() => {
        const activeOrderConfig = PEARL_ORDER_CONFIGS[datasetKey] || PEARL_ORDER_CONFIGS['vanilla'];
        return (pearls: PearlData[]) => orderPearls(pearls, activeOrderConfig);
    }, [datasetKey]);

    const isLoading = !pearls;

    useEffect(() => {
        if (pearls !== null) document.getElementById('rw-static-index')?.remove();
    }, [pearls]);

    return (
        <div
            className={cn(
                "min-h-screen w-full relative flex items-center justify-center overflow-y-hidden",
                isMobile ? "p-0" : "p-4 md:p-8"
            )}
            style={{
                backgroundImage: `url(${assetUrl('img/Pc-main-menu.webp')})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundAttachment: "fixed",
                backgroundColor: "#101010",
            }}
        >
            <div className="absolute inset-0 backdrop-blur-sm bg-black/30"/>

            <div className={cn("relative z-10 w-full max-w-[1400px] h-full", isMobile ? "" : "h-auto")}>
                {error ? (
                    <div className="flex items-center justify-center h-full min-h-[100dvh]">
                        <div className="text-center text-white p-6 bg-black/50 rounded-xl border border-white/20">
                            <h2 className="text-xl font-bold mb-2 text-red-400">Error Loading Data</h2>
                            <p>{error}</p>
                        </div>
                    </div>
                ) : isLoading ? (
                    <div className="flex items-center justify-center h-full min-h-[100dvh]">
                        <KarmaSpinner/>
                    </div>
                ) : (
                    <AppProvider pearls={pearls} sourceData={sourceData} datasetKey={datasetKey} isMobile={isMobile}>
                        <Content orderer={configuredOrderPearls}/>
                    </AppProvider>
                )}
            </div>
        </div>
    );
}
