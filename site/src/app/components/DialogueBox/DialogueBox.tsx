import { TranscriberSelector } from "./TranscriberSelector";
import { DialogueContent } from "./DialogueContent";
import { DialogueLine } from "../../types/types";
import { findSourceDialogue, resolveVariables, getSpeakerDef } from "../../utils/speakers";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion"
import { WelcomeDialogueContent } from "./WelcomeDialogueContent";
import UnlockManager from "../../utils/unlockManager";
import HintSystemContent from "./HintSystemContent";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@shadcn/components/ui/tooltip";
import { renderDialogueLine } from "../../utils/renderDialogueLine";
import { cn } from "@shadcn/lib/utils";
import { DialogueActionTabs } from "./DialogueActionTabs";
import { useAppContext } from "../../context/AppContext";
import { findTranscriberIndex } from "../../utils/transcriberUtils";
import { REPO_URL, PRIVACY_URL, AUTHOR_NAME } from "../../config/site";

const CopyIdButton = ({ internalId }: { internalId: string }) => {
    const [copied, setCopied] = useState(false);
    return (
        <Tooltip key="internal-id-tooltip">
            <TooltipTrigger onClick={() => {
                navigator.clipboard.writeText(internalId);
                setCopied(true);
                setTimeout(() => setCopied(false), 1000);
            }}>
                <div className="font-mono text-xs text-white/70 cursor-pointer">
                    {copied ? "Copied!" : internalId}
                </div>
            </TooltipTrigger>
            <TooltipContent className="text-center">
                The above-listed name is likely community-given.<br/>
                The game references this data entry using this internal ID.<br/>
                Click to copy the internal ID to your clipboard.
            </TooltipContent>
        </Tooltip>
    );
};


function EntryDetailsContent({ info, mapInfo }: {
    info?: string;
    mapInfo?: string;
}) {
    const hasInfo = !!info;
    const hasMapInfo = !!mapInfo;

    return (
        <div className="flex flex-col mt-20 px-4 gap-8">
            {hasInfo && (
                <div className="flex flex-col gap-3 flex-1">
                    <div className="text-white text-lg">About this entry</div>
                    <p className="text-sm text-white/80 leading-relaxed"
                       dangerouslySetInnerHTML={{ __html: renderDialogueLine(resolveVariables(info!)) }}
                    />
                </div>
            )}
            {hasMapInfo && (
                <div className="flex flex-col gap-3 flex-1">
                    <div className="text-white text-lg">About the Map Location</div>
                    <p className="text-sm text-white/80 leading-relaxed"
                       dangerouslySetInnerHTML={{ __html: renderDialogueLine(resolveVariables(mapInfo!)) }}
                    />
                </div>
            )}
        </div>
    );
}

export function DialogueBox() {
    const {
        selectedPearlData: pearl,
        selectedTranscriberName,
        unlockMode,
        handleSelectPearl,
        sourceFileDisplay,
        setSourceFileDisplay,
        filters,
        isMobile,
        sourceData
    } = useAppContext();

    const [hoveredTranscriber, setHoveredTranscriber] = useState<string | null>(null);
    const [lastTranscriberName, setLastTranscriberName] = useState<string | null>(null);
    const [touchStart, setTouchStart] = useState<{ x: number; y: number } | null>(null);
    const [detailsMode, setDetailsMode] = useState(false);
    const selfRef = useRef<HTMLDivElement>(null);
    const [containerWidth, setContainerWidth] = useState(0);

    const [unlockUpdateTrigger, setUnlockUpdateTrigger] = useState(0);

    useEffect(() => {
        const handler = () => setUnlockUpdateTrigger(prev => prev + 1);
        window.addEventListener('unlock-state-changed', handler);
        return () => window.removeEventListener('unlock-state-changed', handler);
    }, []);

    useEffect(() => {
        setDetailsMode(false);
    }, [pearl?.id]);

    useEffect(() => {
        const el = selfRef.current;
        if (!el) return;
        const observer = new ResizeObserver(entries => {
            setContainerWidth(entries[0].contentRect.width);
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        // touch event handler for swipe gestures
        if (!isMobile) return;

        const handleTouchStart = (e: TouchEvent) => {
            // check if the target is an input field
            if (e.target instanceof HTMLElement && e.target.tagName === 'INPUT') return;
            setTouchStart({
                x: e.touches[0].clientX,
                y: e.touches[0].clientY
            });
        };

        const handleTouchEnd = (e: TouchEvent) => {
            if (!touchStart) return;

            const touchEnd = {
                x: e.changedTouches[0].clientX,
                y: e.changedTouches[0].clientY
            };

            const deltaX = touchEnd.x - touchStart.x;
            const deltaY = touchEnd.y - touchStart.y;

            // Only handle horizontal swipes that are longer than vertical movement
            if (Math.abs(deltaX) > Math.abs(deltaY)) {
                // Create and dispatch a synthetic keyboard event
                const syntheticEvent = new KeyboardEvent('keydown', {
                    key: deltaX > 0 ? 'ArrowLeft' : 'ArrowRight',
                    bubbles: true
                });
                window.dispatchEvent(syntheticEvent);
            }

            setTouchStart(null);
        };

        window.addEventListener('touchstart', handleTouchStart);
        window.addEventListener('touchend', handleTouchEnd);

        return () => {
            window.removeEventListener('touchstart', handleTouchStart);
            window.removeEventListener('touchend', handleTouchEnd);
        };
    }, [isMobile, touchStart]);

    // set up the subtitle with the transcriber's name
    useEffect(() => {
        if (hoveredTranscriber === null) {
            return;
        }
        if (pearl) {
            if (hoveredTranscriber.startsWith("plain=")) {
                const transcriberName = hoveredTranscriber.replace("plain=", "");
                setLastTranscriberName(transcriberName);
            } else {
                const transcriberIndex = findTranscriberIndex(pearl, hoveredTranscriber);
                if (transcriberIndex !== -1) {
                    let transcriberName = getSpeakerDef(pearl.transcribers[transcriberIndex].transcriber).name ?? "Unknown";

                    const parenthesisMatch = transcriberName.match(/(.*) \((.*)\)/);
                    let parenthesis = "";
                    if (parenthesisMatch) {
                        transcriberName = parenthesisMatch[1];
                        parenthesis = ` (${parenthesisMatch[2]})`;
                    }

                    if (transcriberName.endsWith('s')) {
                        transcriberName = transcriberName.slice(0, -1);
                    }

                    if (pearl.transcribers[transcriberIndex]?.metadata?.type === "echo") {
                        transcriberName += "'s Encounter";
                    } else {
                        transcriberName += transcriberName.includes("Pearl Reader")
                            ? "'s Projection" + parenthesis
                            : "'s Transcription" + parenthesis;

                    }

                    setLastTranscriberName(transcriberName);
                }
            }
        }
    }, [hoveredTranscriber, pearl]);


    const unlockTranscription = useCallback(() => {
        if (pearl) {
            UnlockManager.unlockPearl(pearl);
            if (selectedTranscriberName) UnlockManager.unlockTranscription(pearl, selectedTranscriberName);
            setUnlockUpdateTrigger(prev => prev + 1); // Trigger re-render to update isUnlocked status
        }
    }, [pearl, selectedTranscriberName]);

    const pearlActiveContent = useMemo(() => {
        if (!pearl) {
            return null;
        }
        const selectedTranscriberIndex = findTranscriberIndex(pearl, selectedTranscriberName ?? "");
        const effectiveIndex = selectedTranscriberIndex === -1
            ? pearl.transcribers.length - 1
            : selectedTranscriberIndex;
        if (effectiveIndex < 0) return null;

        const dialogue = pearl.transcribers[effectiveIndex];
        const isUnlocked = unlockMode === 'all' || UnlockManager.isTranscriptionUnlocked(pearl, selectedTranscriberName!);

        const internalId = dialogue.metadata.internalId || pearl.metadata.internalId;
        let sourceFileDisplayText: string | null;
        let sourceFileDisplayTextSelection: string | null;
        if (sourceFileDisplay) {
            sourceFileDisplayTextSelection = sourceFileDisplay;
            sourceFileDisplayText = sourceFileDisplay.split(/[/\\]/).pop() || "";
        } else if (dialogue.metadata.sourceDialogue) {
            if (dialogue.metadata.sourceDialogue.length === 1) {
                sourceFileDisplayTextSelection = dialogue.metadata.sourceDialogue[0];
                sourceFileDisplayText = sourceFileDisplayTextSelection.split(/[/\\]/).pop() || "";
            } else if (dialogue.metadata.sourceDialogue.filter(f => !f.includes("strings")).length) {
                sourceFileDisplayTextSelection = dialogue.metadata.sourceDialogue.filter(f => !f.includes("strings"))[0];
                sourceFileDisplayText = sourceFileDisplayTextSelection.split(/[/\\]/).pop() || "";
            } else {
                sourceFileDisplayText = null;
                sourceFileDisplayTextSelection = null;
            }
        } else {
            sourceFileDisplayText = null;
            sourceFileDisplayTextSelection = null;
        }
        const internalIdElement = internalId && <CopyIdButton internalId={internalId}/>;
        const sourceFileElement = sourceFileDisplayText && <Tooltip key={"source-file-tooltip"}>
            <TooltipTrigger
                onClick={() => setSourceFileDisplay(sourceFileDisplayTextSelection === sourceFileDisplay ? null : sourceFileDisplayTextSelection)}
            >
                <span className={"font-mono text-xs text-white/70"}>
                    {sourceFileDisplayText} {dialogue.metadata.sourceDialogue && dialogue.metadata.sourceDialogue.length > 1 && ("(+" + (dialogue.metadata.sourceDialogue.length - 1) + ")")}
                </span>
            </TooltipTrigger>
            <TooltipContent className="text-center">
                Dialogue is stored in encrypted files inside the game's folders.<br/>
                This is the filename that the current transcriber's dialogue is stored in.
            </TooltipContent>
        </Tooltip>;

        let bottomElement = null;
        if (internalIdElement) {
            bottomElement = internalIdElement;
        }
        if (sourceFileElement) {
            if (bottomElement) {
                bottomElement = <span className={"font-mono text-xs text-white/70 cursor-pointer"}>
                    {bottomElement} / {sourceFileElement}
                </span>
            } else {
                bottomElement =
                    <span className={"font-mono text-xs text-white/70 cursor-pointer"}>{sourceFileElement}</span>;
            }
        }

        let displayLines: DialogueLine[];
        if (sourceFileDisplay) {
            const foundEntry = findSourceDialogue(sourceFileDisplay, sourceData);
            if (foundEntry) {
                if (foundEntry.c) {
                    displayLines = foundEntry.c.replaceAll("\n\n", "\n").replaceAll("<", "&lt;").replaceAll(">", "&gt;").split("\n").map(line => ({ text: line }));
                } else if (foundEntry.n.includes("png")) {
                    displayLines = [{ text: "![" + foundEntry.p + "]" }];
                } else {
                    displayLines = [{ text: "Error: Source file does not provide content." }];
                }
            } else {
                displayLines = [{ text: "Error: Source file not found." }];
            }
        } else {
            displayLines = dialogue.lines;
        }


        const name = (sourceFileDisplay ? (sourceFileDisplay.split(/[/\\]/).pop() || "") : null) || dialogue.metadata.name || pearl.metadata.name;
        let moveTitleLeft: boolean = false;
        let textContainerClass;
        if (isMobile) {
            textContainerClass = "max-h-[calc(85vh-2px)] pt-16";
        } else {
            let moveDown: boolean;
            if (containerWidth > 0) {
                let remainingSpaceHalf = (containerWidth / 2)
                    - (name.length * 9.5) / 2
                    - pearl.transcribers.length * 54;
                let remainingSpaceFull = containerWidth
                    - (name.length * 9.5)
                    - pearl.transcribers.length * 54;

                moveDown = remainingSpaceFull < 110;
                moveTitleLeft = !moveDown && remainingSpaceHalf < 30;
            } else {
                const textFactor: number = window.innerWidth - name.length * 5;
                moveDown = textFactor < 850;
            }
            if (moveDown) {
                textContainerClass = "max-h-[calc(80vh-2px)] pt-16";
            } else {
                textContainerClass = "max-h-[calc(80vh-2px)]";
            }
        }

        const titleElement = (
            <div className={cn(
                "text-white text-lg mb-8 pb-0 flex justify-center flex-col",
                moveTitleLeft ? "items-start pl-10" : "items-center",
                bottomElement ? "mt-5" : "mt-7"
            )}>
                <TooltipProvider delayDuration={120} key={"tooltip-provider"}>
                    <div className="text-selectable text-center">{name}</div>
                    {bottomElement}
                </TooltipProvider>
            </div>
        );

        console.log(pearl.id, '-', pearl.metadata.type, '-', pearl.metadata.subType ?? pearl.metadata.color);

        return <>
            <DialogueActionTabs
                pearl={pearl}
                transcriberData={dialogue}
                isUnlocked={isUnlocked}
                onSelectPearl={() => handleSelectPearl(null)}
                selectedTranscriberIndex={effectiveIndex}
                detailsMode={detailsMode}
                onToggleDetails={() => setDetailsMode(prev => !prev)}
            />
            <TranscriberSelector
                pearl={pearl}
                onHover={setHoveredTranscriber}
            />
            <div className={cn("overflow-y-auto no-scrollbar", textContainerClass)}>
                {detailsMode ? (
                    <EntryDetailsContent
                        info={dialogue.metadata.info}
                        mapInfo={dialogue.metadata.mapInfo}
                    />
                ) : isUnlocked ? <>
                    {titleElement}
                    <DialogueContent
                        lines={displayLines}
                        searchText={filters.text}
                    />
                </> : <HintSystemContent
                    key={pearl.id + '-' + effectiveIndex}
                    pearl={pearl}
                    transcriberData={dialogue}
                    unlockTranscription={unlockTranscription}
                />}
            </div>
        </>;
    }, [pearl, selectedTranscriberName, unlockMode, unlockTranscription, sourceFileDisplay, filters.text, isMobile, handleSelectPearl, setSourceFileDisplay, sourceData, unlockUpdateTrigger, containerWidth, detailsMode]);

    return (
        <div className="flex-1 relative">
            <div ref={selfRef}
                 className={cn(
                     "flex flex-col bg-black border-2 border-white/80 rounded-xl px-12 lg:pl-24 lg:pr-24 text-white text-sm relative shadow-[0_0_10px_rgba(255,255,255,0.1)]",
                     isMobile ? "max-h-[85dvh] min-h-[85dvh]" : "max-h-[80dvh] min-h-[80dvh]"
                 )}>
                {pearl ? pearlActiveContent : <WelcomeDialogueContent/>}
            </div>
            <motion.div
                key={lastTranscriberName}
                initial={{ opacity: 0 }}
                animate={{
                    opacity: hoveredTranscriber !== null ? [0.5, 0.95] : [0],
                    transition: {
                        ease: "easeInOut",
                        duration: 0.4,
                        repeat: hoveredTranscriber !== null ? Number.POSITIVE_INFINITY : 0,
                        repeatType: "reverse"
                    },
                }}
                className="absolute bottom-[-2rem] left-0 right-0 text-center text-white drop-shadow-md pointer-events-none"
            >
                {lastTranscriberName}
            </motion.div>
            {pearl === null ?
                <div
                    className="absolute bottom-[1rem] left-0 right-0 mx-2 text-center text-white text-sm bg-black/80 rounded">
                    Code on <a href={REPO_URL} target="_blank"
                               className="underline">GitHub</a> | Created by {AUTHOR_NAME} | <a
                    href="https://store.steampowered.com/app/312520/Rain_World" target="_blank" className="underline">Rain
                    World</a> is property of <a href="https://videocultmedia.com" target="_blank"
                                                className="underline">Videocult</a> | <a
                    href={PRIVACY_URL} target="_blank"
                    className="underline">Privacy Policy</a>
                </div> : null}
        </div>
    )
}