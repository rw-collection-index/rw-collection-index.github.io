"use client"

import { useEffect, useState } from "react";
import { RwIconButton } from "../other/RwIconButton"
import UnlockManager from "../../utils/unlockManager"
import { useAppContext } from "../../context/AppContext";
import { SaveFileUpload } from "../SaveFileUpload/SaveFileUpload";
import { TitleSection } from "./TitleSection";
import { datasetRootHref } from "../../routing/browserRouting";
import { assetUrl } from "../../utils/assetUtils";
import { NEW_ISSUE_URL } from "../../config/site";

async function buildIssueUrl(data: Map<string, Set<string>>): Promise<string> {
    const groupPrefixes = [
        'Watcher_Pearl_Misc_Projection_',
        'Misc_WHITE_PEARLS_',
        'PebblesPearl_',
        'BroadcastMisc_',
        'DevComm_'
    ];

    const normalEntries: string[] = [];
    const groupedMap = new Map<string, string[]>();

    const sortedData = Array.from(data.entries())
        .sort(([idA], [idB]) => idA.localeCompare(idB));

    for (const [id, transcribers] of sortedData) {
        const transcriberText = transcribers.size > 1
            ? ` [${Array.from(transcribers).join(', ')}]`
            : '';
        const matchingPrefix = groupPrefixes.find(prefix => id.startsWith(prefix));
        if (matchingPrefix) {
            if (!groupedMap.has(matchingPrefix)) groupedMap.set(matchingPrefix, []);
            groupedMap.get(matchingPrefix)!.push(id.slice(matchingPrefix.length) + transcriberText);
        } else {
            normalEntries.push(id + transcriberText);
        }
    }

    const finalLines = [...normalEntries];
    // Swapped to .forEach() to avoid TS2802
    groupedMap.forEach((suffixes, prefix) => {
        finalLines.push(`${prefix}* (${suffixes.length}): ${suffixes.join(', ')}`);
    });
    finalLines.sort((a, b) => a.localeCompare(b));
    const entriesText = finalLines.join('\n');

    const bodyParts = [
        '### Expected behavior', '', '',
        '### Actual behavior', '', '',
        '---', '',
        '### Save File', '',
        '_Please drag your `sav` file here._', '',
        '### Additional Details', '', '',
        '---', '',
    ];

    const plainDetails = [
        '<details>',
        `<summary><b>Parsed Entries (${data.size} total)</b></summary>`,
        '', '```text', entriesText, '```', '',
        '</details>'
    ].join('\n');

    let details: string;
    if ([...bodyParts, plainDetails].join('\n').length > 6000) {
        const encoded = new TextEncoder().encode(entriesText);
        const cs = new CompressionStream('gzip');
        const writer = cs.writable.getWriter();
        writer.write(encoded);
        writer.close();
        const chunks: Uint8Array[] = [];
        const reader = cs.readable.getReader();
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }
        const combined = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
        let offset = 0;
        for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length; }
        const binaryString = Array.from(combined, b => String.fromCharCode(b)).join('');
        // base64(gzip(text)) goes in CyberChef input box; btoa again for the input= URL param
        const inputParam = btoa(btoa(binaryString));
        const recipe = `From_Base64('A-Za-z0-9%2B/%3D',true,false)Gunzip()`;
        const cyberChefUrl = `https://gchq.github.io/CyberChef/#recipe=${recipe}&input=${inputParam}`;
        details = `_Parsed Entries (${data.size} total) compressed due to size. [View in CyberChef](${cyberChefUrl})_`;
    } else {
        details = plainDetails;
    }

    const params = new URLSearchParams({
        title: 'Save File Parsing: ',
        labels: 'bug,save-file',
        body: [...bodyParts, details].join('\n')
    });
    return `${NEW_ISSUE_URL}?${params.toString()}`;
}


export function WelcomeDialogueContent() {
    const { unlockMode, setUnlockMode, datasetKey, saveFound } = useAppContext();
    const [issueUrl, setIssueUrl] = useState<string | null>(null);
    const [issueUrlFailed, setIssueUrlFailed] = useState(false);

    useEffect(() => {
        if (saveFound.size === 0) return;
        setIssueUrl(null);
        setIssueUrlFailed(false);
        let cancelled = false;
        buildIssueUrl(saveFound)
            .then(url => { if (!cancelled) setIssueUrl(url); })
            .catch(() => { if (!cancelled) setIssueUrlFailed(true); });
        return () => { cancelled = true; };
    }, [saveFound]);

    const isModded = datasetKey === 'modded';

    const handleDatasetChange = (newDataset: 'vanilla' | 'modded') => {
        window.location.href = datasetRootHref(newDataset);
    };

    return (
        <div className="w-full h-full overflow-y-auto no-scrollbar pb-12">
            {/* Header, iconic, unchanged */}
            <div className="grid grid-cols-1 grid-rows-1 place-items-center text-center mt-10 pb-6">
                <div className="col-start-1 row-start-1 flex items-center justify-center w-full select-none pointer-events-none">
                    <img
                        src={assetUrl("img/The_Scholar.png")}
                        alt="The Scholar"
                        className="w-1/2 max-w-[20rem] h-auto opacity-20 -mb-4"
                        style={{ imageRendering: "pixelated" }}
                    />
                </div>
                <div className="col-start-1 row-start-1 z-10 flex flex-col items-center">
                    <TitleSection showModded={datasetKey === 'modded'} />
                    <div className="text-xl">Select any pearl or broadcast to view its content.</div>
                </div>
            </div>

            {/*
             * Settings bar, flex row, centered. Each column is one unit:
             *   primary button (h-12) + secondary zone (h-8, always present).
             *
             * Secondary zones hold the same kind of element, a small RwIconButton:
             *   Spoiler Protection → Reset Unlocks (action)
             *   Save File          → Report Issue   (opens pre-filled GitHub issue URL)
             *   Modded Content     → h-8 spacer     (no sub-action; disclaimer is full-width below)
             *
             * invisible preserves the h-8 height without layout shift.
             * justify-center keeps the group tight, excess space goes to the sides, not between columns.
             */}
            <div className="flex flex-row flex-wrap justify-center gap-6 px-8 mt-12 items-start">

                {/* Spoiler Protection, gold when active, sub-action: Reset Unlocks */}
                <div className="flex flex-col items-center gap-2">
                    <RwIconButton
                        square={false}
                        variant={unlockMode === 'unlock' ? 'gold' : 'default'}
                        onClick={() => setUnlockMode(unlockMode === 'unlock' ? 'all' : 'unlock')}
                        aria-label="Toggle spoiler protection"
                    >
                        Spoiler Protection
                    </RwIconButton>
                    <div className={unlockMode !== 'unlock' ? 'invisible' : undefined}>
                        <RwIconButton
                            square={false}
                            size="small"
                            aria-label="Reset all unlocks"
                            onClick={() => {
                                if (window.confirm("Are you sure you want to reset all unlocks?")) {
                                    UnlockManager.reset();
                                }
                            }}
                        >
                            Reset Unlocks
                        </RwIconButton>
                    </div>
                </div>

                {/* Save File, vanilla only; sub-action: Found {N} opens issue URL */}
                {!isModded && (
                    <div className="flex flex-col items-center gap-2">
                        <SaveFileUpload />
                        {/* Visible only once the URL is ready, no loading state, no flash */}
                        <div className={(saveFound.size === 0 || (!issueUrl && !issueUrlFailed)) ? 'invisible' : undefined}>
                            <RwIconButton
                                square={false}
                                size="small"
                                aria-label="Report a parsing issue on GitHub"
                                onClick={() => window.open(
                                    issueUrl ?? NEW_ISSUE_URL,
                                    '_blank'
                                )}
                            >
                                Report Issue
                            </RwIconButton>
                        </div>
                    </div>
                )}

                {/* Modded Content, gold when active; disclaimer is full-width below */}
                <div className="flex flex-col items-center gap-2">
                    <RwIconButton
                        square={false}
                        variant={isModded ? 'gold' : 'default'}
                        onClick={() => handleDatasetChange(isModded ? 'vanilla' : 'modded')}
                        aria-label="Toggle modded content"
                    >
                        Modded Content
                    </RwIconButton>
                    <div className="h-8" /> {/* spacer: keeps this column the same height as the others */}
                </div>
            </div>

            {/* Modded disclaimer, full width, below the bar; only in modded mode */}
            {isModded && (
                <div className="mt-3 px-8 text-center text-white/40 text-xs space-y-1">
                    <p>Unofficial Mod Index. Selection of mods does not indicate preference or affiliation and may expand in the future.</p>
                    <p>Please support the creators by playing their mods. All dialogue belongs to the respective mod authors.</p>
                    <p>As mods update frequently, this index may not reflect the latest versions.</p>
                </div>
            )}

            {/* Controls, compact inline footnote; code badges match the monospace aesthetic */}
            <p className="mt-6 px-8 text-white/30 text-xs text-center">
                <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono">WASD</code>
                {' / '}
                <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono">← ↑ → ↓</code>
                {' navigate grid - '}
                <code className="bg-white/10 px-1.5 py-0.5 rounded font-mono">Q/E</code>
                {' switch transcribers'}
            </p>
        </div>
    );
}
