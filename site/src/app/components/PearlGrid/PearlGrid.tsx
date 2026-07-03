import { PearlData } from "../../types/types";
import { RwTextInput } from "./RwTextInput";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PearlItem from "./PearlItem";
import { cn } from "@shadcn/lib/utils";
import { RwIconButton } from "../other/RwIconButton";
import { FilterOption, FilterSection, PearlFilter } from "./PearlFilter";
import { getSpeakerInfo, getRegion, regions, speakers } from "../../utils/speakers";
import { Tint } from "../../utils/assetUtils";
import { randomColor } from "../../utils/colorUtils";
import { OrderedChapter } from "../../utils/pearlOrder";
import { UnlockMode, useAppContext } from "../../context/AppContext";
import UnlockManager from "../../utils/unlockManager";
import { useFilteredPearls } from "../../hooks/useFilteredPearls";
import { useChapterExpansion } from "../../hooks/useChapterExpansion";
import { useKeyboardNavigation } from "../../hooks/useKeyboardNavigation";
import { Popover, PopoverContent, PopoverTrigger } from "@shadcn/components/ui/popover";
import { RwScrollableList, RwScrollableListItem } from "../other/RwScrollableList";
import { RwAsset } from "../other/RwAsset";
import { datasetRootHref, routeHref } from "../../routing/browserRouting";
import { defaultTranscriberName, entryIdForPearl } from "../../routing/routes";
import { assetUrl } from "../../utils/assetUtils";

const HIGHLIGHT_STYLE: React.CSSProperties = { outline: '2px solid rgba(255, 255, 255, 0.5)', borderRadius: '0.75rem' };

interface FlatChapterItem {
    id: string;
    name: string;
    items: PearlData[];
    depth: number;
    hasSubChapters: boolean;
    isExpanded: boolean;
    originalChapter: OrderedChapter;
}

const chapterHasDiscoveredEntry = (chapter: OrderedChapter): boolean => {
    // a chapter counts as discovered if any of its entries, at any depth, is unlocked
    if (chapter.items?.some(item => item && UnlockManager.isPearlUnlocked(item))) return true;
    return chapter.subChapters?.some(chapterHasDiscoveredEntry) ?? false;
};

interface PearlGridProps {
    order: (pearls: PearlData[]) => OrderedChapter[];
    isAlternateDisplayModeActive?: boolean;
}

const SearchBar = () => {
    const { isMobile, unlockMode, setUnlockMode, filters, setFilters, saveFound } = useAppContext();
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const onTextInput = useCallback((text: string) => {
        setFilters(prev => ({ ...prev, text: text === '' ? undefined : text }));
    }, [setFilters]);

    const isModded = (window as any).__RW_DATA_KEY__ === 'modded';

    const menuItems: RwScrollableListItem[] = useMemo(() => [
        {
            id: 'spoiler',
            title: unlockMode === "all" ? "Hide Spoilers" : "Show All Content",
            subtitle: unlockMode === "all" ? "Spoiler protection is OFF" : "Spoiler protection is ON",
            onClick: () => {
                setUnlockMode(unlockMode === "all" ? "unlock" : "all");
                setIsMenuOpen(false);
            }
        },
        {
            id: 'data-switch',
            title: isModded ? "Show Vanilla Content" : "Show Modded Content",
            subtitle: isModded ? "Load official content" : "Load community mods",
            onClick: () => {
                window.location.href = datasetRootHref(isModded ? 'vanilla' : 'modded');
            }
        }
    ], [unlockMode, isModded, setUnlockMode]);

    const { pearls } = useAppContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const typeFilterColors = useMemo(() => ({ pearl: randomColor(), broadcast: randomColor() }), []);
    const filterSections: FilterSection[] = useMemo(() => {
        const uniqueRegions = new Set<string>();
        pearls.forEach(p => p.transcribers.forEach(t => t.metadata.map?.forEach(m => m.region && uniqueRegions.add(m.region))));

        const uniqueSpeakers = new Set<string>();
        pearls.forEach(p => p.transcribers.forEach(t => t.lines.forEach(l => {
            if (l.speaker) {
                uniqueSpeakers.add((l.namespace ? l.namespace + "-" : "") + l.speaker);
            }
        })));
        uniqueSpeakers.delete("Five Pebbles");
        uniqueSpeakers.delete("EP"); // merged into FP

        const regionKeys = Object.keys(regions);
        const sortedRegions = Array.from(uniqueRegions).sort((a, b) => {
            const indexA = regionKeys.indexOf(a);
            const indexB = regionKeys.indexOf(b);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return a.localeCompare(b);
        });
        const speakerKeys = Object.keys(speakers);
        const sortedSpeakers = Array.from(uniqueSpeakers).sort((a, b) => {
            const indexA = speakerKeys.indexOf(a);
            const indexB = speakerKeys.indexOf(b);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA !== -1) return -1;
            if (indexB !== -1) return 1;
            return a.localeCompare(b);
        });

        const tagOptions: FilterOption[] = [
            { id: "vanilla", label: "Vanilla (No DLC)", asset: { src: "vanilla-rw" } },
            { id: "downpour", label: "Downpour", asset: { src: "dlc-dp" } },
            { id: "watcher", label: "Watcher", asset: { src: "dlc-watcher" } },
            { id: "saveFound", label: "Found in Save", asset: { src: "pearl", tint: Tint.mask('#FFD700') }, accentColor: '#FFD700' },
        ];

        const sections: FilterSection[] = [
            {
                title: "Tags",
                options: tagOptions,
            },
            {
                title: "Types",
                options: [
                    { id: "pearl", label: "Pearl", asset: { src: "pearl", tint: Tint.mask(typeFilterColors.pearl) }, accentColor: typeFilterColors.pearl },
                    { id: "broadcast", label: "Broadcast", asset: { src: "broadcast", tint: Tint.mask(typeFilterColors.broadcast) }, accentColor: typeFilterColors.broadcast },
                    { id: "echo", label: "Echo", asset: { src: "echo" } },
                    { id: "item", label: "Other", asset: { src: "item/Bubble_Weed_icon" } }
                ]
            },
            {
                title: "Regions",
                options: sortedRegions.map(r => {
                    const region = getRegion(r);
                    return {
                        id: r,
                        label: region.name,
                        asset: region.image ? { src: region.image, fit: "cover" as const } : undefined,
                        accentColor: region.color,
                    };
                }),
            },
            {
                title: "Speakers",
                options: sortedSpeakers.map(s => {
                    let actualSpeaker = s;
                    let namespace = undefined;
                    const hyphenIndex = s.indexOf('-');
                    if (s.startsWith('NS') && hyphenIndex > 2 && hyphenIndex < s.length - 1) {
                        namespace = s.slice(0, hyphenIndex);
                        actualSpeaker = s.slice(hyphenIndex + 1);
                    }

                    const info = getSpeakerInfo(s, actualSpeaker, namespace);
                    const accentColor = info.asset?.tint?.mode === "mask" ? info.asset.tint.color : undefined;

                    return {
                        id: s,
                        label: info.displayName === '(Unknown)' ? s : info.displayName.split(' / ')[0],
                        asset: info.asset,
                        accentColor,
                    };
                }),
            }
        ];

        return sections;
    }, [pearls, saveFound.size]);

    return (
        <div className={"flex gap-2 items-center"}>
            <div className={cn("relative flex items-center", isMobile ? "flex-1" : "w-full")}>
                <RwTextInput
                    value={filters.text || ''}
                    className="w-full pr-8 bg-gray-950"
                    onTextInput={onTextInput}
                    placeholder="Search..."
                />
                {(filters.text || '').length > 0 && (
                    <button
                        type="button"
                        onClick={() => onTextInput('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-white/60 hover:text-white focus:outline-none transition-colors"
                        aria-label="Clear search">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2}
                             stroke="currentColor" className="w-4 h-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                    </button>
                )}
            </div>
            <PearlFilter filters={filters} setFilters={setFilters} filterSections={filterSections}/>
            {isMobile && (
                <Popover open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                    <PopoverTrigger asChild>
                        <div onClick={(e) => e.stopPropagation()} className="shrink-0">
                            <RwIconButton square={true} aria-label="Menu" padding="p-2">
                                <RwAsset src="The_Scholar_Square" />
                            </RwIconButton>
                        </div>
                    </PopoverTrigger>
                    <PopoverContent
                        className="w-72 p-0 z-50 bg-black rounded-xl border-2 border-white/50 shadow-lg text-white"
                        align="end" sideOffset={5}>
                        <RwScrollableList items={menuItems} breakSubtitle={true}/>
                    </PopoverContent>
                </Popover>
            )}
        </div>
    );
};

// receives a stable toggleChapter ref so React.memo can bail out when chapter content hasn't changed
const BannerChapterHeader = React.memo(function BannerChapterHeader({ flatChapter, toggleChapter, isObfuscated }: {
    flatChapter: FlatChapterItem,
    toggleChapter: (name: string) => void,
    isObfuscated: boolean
}) {
    const { originalChapter, depth } = flatChapter;
    const { icon: iconUrl, link: linkData } = originalChapter;
    const [isLinkPopoverOpen, setIsLinkPopoverOpen] = useState(false);

    const iconElement = useMemo(() => {
        if (!iconUrl) return null;

        const ImageContent = (
            <img src={assetUrl(iconUrl)} alt={"Icon for " + flatChapter.name} className="rounded-md"/>
        );

        if (typeof linkData === 'string') {
            return (
                <a
                    href={linkData}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 block"
                    onClick={(e) => e.stopPropagation()}
                >
                    <RwIconButton
                        square={true}
                        aria-label="Open Link"
                        padding="p-2"
                    >
                        {ImageContent}
                    </RwIconButton>
                </a>
            );
        }

        if (Array.isArray(linkData) && linkData.length > 0) {
            const listItems: RwScrollableListItem[] = linkData.map((link, index) => ({
                id: `link-${index}`,
                title: link.title,
                subtitle: link.subtitle ?? link.url,
                onClick: () => {
                    window.open(link.url, "_blank");
                    setIsLinkPopoverOpen(false);
                },
            }));

            return (
                <Popover open={isLinkPopoverOpen} onOpenChange={setIsLinkPopoverOpen}>
                    <PopoverTrigger asChild>
                        <div onClick={(e) => e.stopPropagation()}>
                            <RwIconButton
                                square={true}
                                aria-label="Open Links"
                                padding="p-2"
                            >
                                {ImageContent}
                            </RwIconButton>
                        </div>
                    </PopoverTrigger>
                    <PopoverContent
                        className="w-64 p-0 z-50 bg-black rounded-xl border-2 border-white/50 shadow-lg text-white"
                        align="end"
                        sideOffset={5}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <RwScrollableList items={listItems} breakSubtitle={false}/>
                    </PopoverContent>
                </Popover>
            );
        }

        return (
            <RwIconButton
                square={true}
                className="cursor-default"
                aria-label="Chapter Icon"
                padding="p-2"
            >
                {ImageContent}
            </RwIconButton>
        );
    }, [iconUrl, linkData, flatChapter.name, isLinkPopoverOpen]);

    return (
        <div
            className={cn("flex w-full gap-2", depth > 0 && "mt-2", flatChapter.isExpanded && ((!flatChapter.originalChapter.subChapters || flatChapter.originalChapter.subChapters.length === 0) || (flatChapter.originalChapter.subChapters && flatChapter.originalChapter.subChapters?.length > 0 && flatChapter.originalChapter.subChapters[0].headerType === "banner")) && "mb-3")}
            style={{
                marginLeft: `${depth * 16}px`,
                width: `calc(100% - ${depth * 16}px)`
            }}
        >
            <RwIconButton
                square={false}
                className="flex-1"
                onClick={() => toggleChapter(flatChapter.name)}
                expandedScaleFactor={0.2}
                aria-label={flatChapter.name}
            >
                <div className="flex w-full items-center justify-start gap-4">
                    <span
                        className={cn("font-medium tracking-wide", flatChapter.isExpanded ? "text-white" : "text-gray-500", flatChapter.name.length > 20 ? "text-sm" : "text-md")}>
                        {isObfuscated ? '???' : flatChapter.name}
                    </span>
                </div>
            </RwIconButton>
            {iconElement}
        </div>
    );
});

const LazyChapterGrid = React.memo(function LazyChapterGrid({
    flatChapter,
    chapterIndex,
    isVisible,
    setVisibleChapters,
    selectedPearlRef,
    highlightedItemIndex,
    isAlternateDisplayModeActive,
    collectionVersion,
    selectedPearlId,
    handleSelectPearl,
    saveFound,
    unlockMode,
    toggleChapter,
    pearls,
    datasetKey,
}: {
    flatChapter: FlatChapterItem
    chapterIndex: number
    isVisible: boolean
    setVisibleChapters: (callback: (prev: Set<number>) => Set<number>) => void
    selectedPearlRef: React.RefObject<HTMLDivElement | null>
    highlightedItemIndex: number | null
    isAlternateDisplayModeActive: boolean
    collectionVersion: number
    selectedPearlId: string | null
    handleSelectPearl: (pearl: PearlData) => void
    saveFound: Map<string, Set<string>>
    unlockMode: UnlockMode
    toggleChapter: (name: string) => void
    pearls: PearlData[]
    datasetKey: string
}) {
    const observerRef = useRef<HTMLDivElement>(null);

    // In spoiler mode, hide a header until at least one of its entries has been discovered.
    const isHeaderObfuscated = useMemo(
        () => unlockMode !== 'all' && !chapterHasDiscoveredEntry(flatChapter.originalChapter),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [flatChapter.originalChapter, unlockMode, collectionVersion]
    );

    useEffect(() => {
        const currentRef = observerRef.current;
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                // Guard: only update state if this chapter isn't already marked visible
                setVisibleChapters(prev => {
                    if (prev.has(chapterIndex)) return prev;
                    const next = new Set(prev);
                    next.add(chapterIndex);
                    return next;
                });
            }
        }, { rootMargin: '200px' });

        if (currentRef) observer.observe(currentRef);
        return () => { observer.disconnect(); };
    }, [chapterIndex, setVisibleChapters]);

    return (
        <div ref={observerRef} className="last:mb-4">
            {flatChapter.name && (
                flatChapter.originalChapter.headerType === "banner" ? (
                    <BannerChapterHeader flatChapter={flatChapter} toggleChapter={toggleChapter} isObfuscated={isHeaderObfuscated}/>
                ) : (
                    <button onClick={() => toggleChapter(flatChapter.name)}
                            className={cn("flex items-center gap-2 w-full text-left group focus:outline-none", flatChapter.isExpanded && flatChapter.items.length > 0 && "mb-2")}
                            style={{ paddingLeft: `${flatChapter.depth * 16}px` }}>
                        <h3 className="text-white text-sm font-medium group-hover:text-white/90">{isHeaderObfuscated ? '???' : flatChapter.name}</h3>
                        <div
                            className={cn("text-white/60 group-hover:text-white transition-transform duration-200", flatChapter.isExpanded ? "rotate-90" : "rotate-0")}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"
                                 fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                                 strokeLinejoin="round">
                                <path d="m9 18 6-6-6-6"/>
                            </svg>
                        </div>
                    </button>
                )
            )}
            {flatChapter.isExpanded && flatChapter.items.length > 0 && (
                <div className="grid grid-cols-5 gap-2 w-fit">
                    {flatChapter.items.map((pearl, pearlIndex) => pearl && pearl.id && (
                        <div key={`pearl-${pearl.id}`}
                             ref={highlightedItemIndex === pearlIndex ? selectedPearlRef : undefined}
                             style={highlightedItemIndex === pearlIndex ? HIGHLIGHT_STYLE : {}}>
                            <PearlItem
                                pearl={pearl}
                                pearlIndex={pearlIndex}
                                showTranscriberCount={isAlternateDisplayModeActive}
                                collectionVersion={collectionVersion}
                                isSelected={pearl.id === selectedPearlId}
                                handleSelectPearl={handleSelectPearl}
                                isFoundInSave={saveFound.has(pearl.id)}
                                unlockMode={unlockMode}
                                renderReal={isVisible}
                                entryUrl={routeHref({ datasetKey, entryId: entryIdForPearl(pearl, pearls), transcriberName: defaultTranscriberName(pearl), source: null })}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
});

export function PearlGrid({ order, isAlternateDisplayModeActive = false }: PearlGridProps) {
    const { pearls, handleSelectPearl, selectedPearlId, isMobile, saveFoundVersion, unlockVersion, saveFound, unlockMode, datasetKey } = useAppContext();
    const collectionVersion = saveFoundVersion + unlockVersion;
    const { baseTree, filteredTree, totalItems, firstItem } = useFilteredPearls(pearls, order);
    const { expandedChapters, toggleChapter, expandAll, collapseAll } = useChapterExpansion(filteredTree, baseTree);

    const isTogglingRef = useRef(false);
    const [visibleChapters, setVisibleChapters] = useState(new Set([0]));
    const selectedPearlRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const desktopToggleRef = useRef<HTMLDivElement>(null);
    const gradientRef = useRef<HTMLDivElement>(null);
    const expandButtonsRef = useRef<HTMLDivElement>(null);

    const handleToggleChapter = useCallback((name: string) => {
        isTogglingRef.current = true;
        toggleChapter(name);
        setTimeout(() => { isTogglingRef.current = false; }, 100);
    }, [toggleChapter]);

    // Automatically select the first item if only one is filtered and on desktop
    useEffect(() => {
        if (!isMobile && totalItems === 1 && firstItem && selectedPearlId !== firstItem.id) {
            const timer = setTimeout(() => handleSelectPearl(firstItem), 0);
            return () => clearTimeout(timer);
        }
    }, [totalItems, firstItem, isMobile, handleSelectPearl, selectedPearlId]);

    // Proximity logic for desktop toggle button
    useEffect(() => {
        if (isMobile) return;

        let rafId: number | null = null;

        const handleMouseMove = (e: MouseEvent) => {
            if (rafId !== null) return;
            const mouseX = e.clientX;
            const mouseY = e.clientY;
            rafId = requestAnimationFrame(() => {
                rafId = null;
                const btn = desktopToggleRef.current;
                if (!btn) return;

                const rect = btn.getBoundingClientRect();
                const btnX = rect.left + rect.width / 2;
                const btnY = rect.top + rect.height / 2;

                const dist = Math.sqrt(Math.pow(mouseX - btnX, 2) + Math.pow(mouseY - btnY, 2));
                const threshold = 90;

                let opacity = 0;
                if (dist < threshold) {
                    const linear = 1 - (dist / threshold);
                    opacity = Math.sin(linear * (Math.PI / 2));
                }

                if (opacity < 0.01) opacity = 0;
                if (opacity > 0.99) opacity = 1;

                btn.style.opacity = opacity.toFixed(2);
                btn.style.pointerEvents = opacity > 0.1 ? 'auto' : 'none';
            });
        };

        window.addEventListener('mousemove', handleMouseMove);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            if (rafId !== null) cancelAnimationFrame(rafId);
        };
    }, [isMobile]);

    const displayList = useMemo(() => {
        const list: FlatChapterItem[] = [];
        const flatten = (chapters: OrderedChapter[], depth: number, parentIdPrefix: string) => {
            chapters.forEach((chapter) => {
                const uniqueId = `${parentIdPrefix}-${chapter.name}`;
                const isExpanded = expandedChapters.has(chapter.name);
                list.push({
                    id: uniqueId,
                    name: chapter.name,
                    items: chapter.items || [],
                    depth: depth,
                    hasSubChapters: !!(chapter.subChapters && chapter.subChapters.length > 0),
                    isExpanded: isExpanded,
                    originalChapter: chapter
                });
                if (isExpanded && chapter.subChapters) {
                    const nextDepth = chapter.headerType === 'banner' ? 0 : depth + 1;
                    flatten(chapter.subChapters, nextDepth, uniqueId);
                }
            });
        };
        flatten(filteredTree, 0, 'root');
        return list;
    }, [filteredTree, expandedChapters]);

    // Scroll-driven DOM updates: no React state means scrolling never triggers re-renders
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const checkScroll = () => {
            const { scrollHeight, clientHeight, scrollTop } = el;
            const hasScrollableContent = scrollHeight > clientHeight;
            const atTop = scrollTop < 10;
            const showGrad = hasScrollableContent && (scrollTop + clientHeight < scrollHeight - 1);

            if (gradientRef.current) {
                gradientRef.current.style.opacity = showGrad ? '1' : '0';
            }
            if (expandButtonsRef.current) {
                expandButtonsRef.current.style.maxHeight = atTop ? '2rem' : '0px';
                expandButtonsRef.current.style.opacity = atTop ? '1' : '0';
            }
        };

        const timer = setTimeout(checkScroll, 0);
        window.addEventListener('resize', checkScroll);
        el.addEventListener('scroll', checkScroll);

        return () => {
            clearTimeout(timer);
            window.removeEventListener('resize', checkScroll);
            el.removeEventListener('scroll', checkScroll);
        };
    }, [displayList]);

    const pearlGrid = useMemo(() => {
        const grid: PearlData[][] = [];
        displayList.forEach(chapter => {
            if (chapter.isExpanded && chapter.items.length > 0) {
                for (let i = 0; i < chapter.items.length; i += 5) {
                    grid.push(chapter.items.slice(i, i + 5));
                }
            }
        });
        return grid;
    }, [displayList]);

    const { currentGridPosition } = useKeyboardNavigation(pearlGrid);

    const highlightedEntry = useMemo<{ chapterId: string; itemIndex: number } | null>(() => {
        if (!currentGridPosition || !selectedPearlId) return null;
        const [targetRow, targetCol] = currentGridPosition;
        let currentRow = 0;
        for (const chapter of displayList) {
            if (chapter.isExpanded && chapter.items.length > 0) {
                const relativeRow = targetRow - currentRow;
                if (relativeRow >= 0 && relativeRow < Math.ceil(chapter.items.length / 5)) {
                    const itemIndex = relativeRow * 5 + targetCol;
                    if (itemIndex < chapter.items.length) {
                        return { chapterId: chapter.id, itemIndex };
                    }
                }
                currentRow += Math.ceil(chapter.items.length / 5);
            }
        }
        return null;
    }, [currentGridPosition, displayList, selectedPearlId]);

    // Scroll selected item into view
    useEffect(() => {
        if (isTogglingRef.current) return;
        if (!selectedPearlRef.current) return;
        const scrollContainer = selectedPearlRef.current.closest('.no-scrollbar');
        if (!scrollContainer) return;
        const itemRect = selectedPearlRef.current.getBoundingClientRect();
        const containerRect = scrollContainer.getBoundingClientRect();
        const padding = 120;
        if (itemRect.top < containerRect.top + padding || itemRect.bottom > containerRect.bottom - padding) {
            selectedPearlRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [currentGridPosition]);

    const isAnyExpanded = expandedChapters.size > 0;
    const handleExpandToggle = useCallback(() => {
        if (isAnyExpanded) {
            collapseAll();
        } else {
            expandAll();
        }
    }, [isAnyExpanded, collapseAll, expandAll]);

    return (
        <div className={cn("relative", isMobile ? "w-full max-h-[98svh] h-[98svh]" : "w-[18rem] max-h-[80svh]")}>
                <div className={cn("no-scrollbar overflow-y-auto box-border h-full", isMobile ? "px-4" : "px-1")}
                     ref={containerRef}>
                    <div className={cn("sticky top-0 z-20", isMobile ? "pt-4" : "pt-1", "mb-4")}>
                        <SearchBar/>
                        {isMobile && (
                            <div
                                ref={expandButtonsRef}
                                className="overflow-hidden transition-all duration-300 ease-in-out"
                                style={{ maxHeight: '2rem', opacity: 1 }}
                            >
                                <div className="flex justify-start gap-2 px-1 mt-1">
                                    <button
                                        onClick={expandAll}
                                        className="text-[10px] uppercase tracking-widest text-white/40 hover:text-white transition-colors flex items-center gap-1 font-medium"
                                    >
                                        <span>Expand</span>
                                    </button>
                                    <span
                                        className="text-[10px] uppercase tracking-widest text-white/40 font-medium"
                                    >/</span>
                                    <button
                                        onClick={collapseAll}
                                        className="text-[10px] uppercase tracking-widest text-white/40 hover:text-white transition-colors flex items-center gap-1 font-medium"
                                    >
                                        <span>Collapse All</span>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className={cn("grid grid-cols-1 gap-4", isMobile ? "" : "px-1", isMobile ? "pb-4" : "pb-1")}>
                        {displayList.map((flatChapter, index) => (
                            <LazyChapterGrid
                                key={flatChapter.id}
                                flatChapter={flatChapter}
                                chapterIndex={index}
                                isVisible={visibleChapters.has(index)}
                                setVisibleChapters={setVisibleChapters}
                                selectedPearlRef={selectedPearlRef}
                                highlightedItemIndex={highlightedEntry?.chapterId === flatChapter.id ? highlightedEntry.itemIndex : null}
                                isAlternateDisplayModeActive={isAlternateDisplayModeActive}
                                collectionVersion={collectionVersion}
                                selectedPearlId={flatChapter.items.some(p => p.id === selectedPearlId) ? selectedPearlId : null}
                                handleSelectPearl={handleSelectPearl}
                                saveFound={saveFound}
                                unlockMode={unlockMode}
                                toggleChapter={handleToggleChapter}
                                pearls={pearls}
                                datasetKey={datasetKey}
                            />
                        ))}
                    </div>
                </div>

                {!isMobile && (
                    <div
                        ref={desktopToggleRef}
                        className="absolute -left-7 top-[3.75rem] z-50 cursor-pointer text-white/40 hover:text-white transition-colors p-2"
                        onClick={handleExpandToggle}
                        title={isAnyExpanded ? "Collapse All" : "Expand All"}
                        style={{ opacity: 0, pointerEvents: 'none' }}
                    >
                        {isAnyExpanded ? (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m18 4-6 6-6-6"/>
                                <path d="m6 20 6-6 6 6"/>
                            </svg>
                        ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m18 10-6-6-6 6"/>
                                <path d="m6 14 6 6 6-6"/>
                            </svg>
                        )}
                    </div>
                )}

                <div
                    ref={gradientRef}
                    className="absolute bottom-0 left-0 right-0 h-8 pointer-events-none bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-white/20 to-transparent transition-opacity duration-300 border-b-2 border-white/50 z-10"
                    style={{ opacity: 0 }}
                />
            </div>
    );
}

export default React.memo(PearlGrid);
