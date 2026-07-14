"use client"

import React, { useCallback, useState } from 'react';
import { RwIconButton } from '../other/RwIconButton';
import { useAppContext } from '../../context/AppContext';
import { loadWasm, parseSaveFile } from '../../utils/wasmLoader';
import { applyCollectibles, extractCollectibles, SaveCollectibles, SaveMatchSummary } from '../../utils/saveCollectibles';
import { loadSaveUnlockEvaluator, SaveUnlockEval } from '../../utils/saveUnlockLoader';
import { SaveFileInfoDialog } from './SaveFileInfoDialog';
import { count } from '../../utils/track';
import { NEW_ISSUE_URL, SUBMIT_SAVE_URL } from '../../config/site';

type UploadState = 'idle' | 'loading-wasm' | 'reading' | 'parsing' | 'done' | 'error';

export function SaveFileUpload() {
    const { pearls, setSaveFound, saveFound, setFilters } = useAppContext();
    const [state, setState] = useState<UploadState>('idle');
    const [showDialog, setShowDialog] = useState(false);
    const [dialogPhase, setDialogPhase] = useState<'upload' | 'confirm'>('upload');
    const [errorMessage, setErrorMessage] = useState<React.ReactNode | null>(null);
    const [pendingCollectibles, setPendingCollectibles] = useState<SaveCollectibles | null>(null);
    const [pendingEvaluator, setPendingEvaluator] = useState<SaveUnlockEval | null>(null);
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [matchSummary, setMatchSummary] = useState<SaveMatchSummary | null>(null);

    const hasSaveData = saveFound.size > 0;
    const isLoading = state === 'loading-wasm' || state === 'reading' || state === 'parsing';

    const loadingLabel =
        state === 'loading-wasm' ? 'Loading...' :
        state === 'reading' ? 'Reading...' : 'Parsing...';

    const processFile = useCallback(async (file: File) => {
        setErrorMessage(null);
        setState('loading-wasm');
        let evaluator: SaveUnlockEval;
        try {
            [, evaluator] = await Promise.all([loadWasm(), loadSaveUnlockEvaluator()]);
        } catch {
            setErrorMessage('Failed to load save file parser.');
            setState('error');
            return;
        }
        setState('reading');
        let xml: string;
        try {
            xml = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsText(file, 'latin1');
            });
        } catch {
            setErrorMessage('Failed to read file.');
            setState('error');
            return;
        }
        setState('parsing');
        try {
            const parsed = await parseSaveFile(xml);
            const collectibles = extractCollectibles(parsed);
            const { summary } = applyCollectibles(pearls, collectibles, 'preview', evaluator);
            setPendingCollectibles(collectibles);
            setPendingEvaluator(evaluator);
            setPendingFile(file);
            setMatchSummary(summary);
            setState('done');
            if (process.env.NODE_ENV !== 'production') {
                (window as any).__rwDebug = {
                    collectibles,
                    evaluate: (expr: string, verbose?: boolean) => evaluator.evaluate(expr, { collectibles, verbose }),
                };
            }
            count('upload-save');
            setDialogPhase('confirm');
        } catch {
            const issueBody = [
                '### Save File',
                '',
                '_Please drag your `sav` file here._',
                '',
                '### Additional Details',
                '',
                '',
            ].join('\n');
            const issueUrl = `${NEW_ISSUE_URL}?${new URLSearchParams({
                title: 'Save File Parsing: could not parse save file',
                labels: 'bug,save-file',
                body: issueBody,
            }).toString()}`;
            setErrorMessage(
                <span>
                    Could not parse save file.<br/>Please&nbsp;
                    <a href={issueUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-red-300 transition-colors">
                        report an issue
                    </a>
                    {' '}and attach your save file.
                </span>
            );
            setState('error');
        }
    }, [pearls]);

    const applyFile = useCallback((donate: boolean, note: string) => {
        if (!pendingCollectibles || !pendingEvaluator) return;
        const { foundData } = applyCollectibles(pearls, pendingCollectibles, 'unlock', pendingEvaluator);
        setSaveFound(foundData);
        if (process.env.NODE_ENV !== 'production') {
            (window as any).__rwDebug = {
                collectibles: pendingCollectibles,
                evaluate: (expr: string, verbose?: boolean) => pendingEvaluator.evaluate(expr, { collectibles: pendingCollectibles, verbose }),
            };
        }
        if (donate && pendingFile) {
            const formData = new FormData();
            formData.append('savefile', pendingFile);
            if (note.trim()) formData.append('note', note.trim());
            fetch(SUBMIT_SAVE_URL, {
                method: 'POST',
                body: formData,
            }).catch(() => {});
        }
        setShowDialog(false);
        setDialogPhase('upload');
        setPendingCollectibles(null);
        setPendingEvaluator(null);
        setPendingFile(null);
        setMatchSummary(null);
        setState('done');
    }, [pendingCollectibles, pendingEvaluator, pendingFile, pearls, setSaveFound]);

    const handleCancel = useCallback(() => {
        setShowDialog(false);
        setDialogPhase('upload');
        setPendingCollectibles(null);
        setPendingEvaluator(null);
        setPendingFile(null);
        setMatchSummary(null);
        setErrorMessage(null);
        setState('idle');
    }, []);

    const handleClose = useCallback(() => {
        if (dialogPhase === 'confirm') {
            handleCancel();
        } else {
            setShowDialog(false);
            setErrorMessage(null);
            setState('idle');
        }
    }, [dialogPhase, handleCancel]);

    const handleClear = useCallback(() => {
        setSaveFound(new Map());
        setFilters(prev => ({ ...prev, saveFound: false }));
        setState('idle');
        if (process.env.NODE_ENV !== 'production') (window as any).__rwDebug = null;
    }, [setSaveFound, setFilters]);

    return (
        <>
            {showDialog && (
                <SaveFileInfoDialog
                    phase={dialogPhase}
                    uploadState={state}
                    errorMessage={errorMessage}
                    matchSummary={matchSummary}
                    onFile={processFile}
                    onConfirm={applyFile}
                    onCancel={handleCancel}
                    onClose={handleClose}
                />
            )}
            <RwIconButton
                square={false}
                variant={hasSaveData ? 'gold' : 'default'}
                aria-label={hasSaveData ? 'Clear save data' : 'Sync from save file'}
                onClick={() => {
                    if (isLoading) return;
                    if (hasSaveData) handleClear();
                    else setShowDialog(true);
                }}
            >
                {isLoading ? loadingLabel : !hasSaveData ? 'Sync from Save' : (
                    <div className="flex flex-col items-center gap-0.5 leading-none">
                        <div>Clear Save Data</div>
                        <div className="text-[10px] opacity-60">{saveFound.size} entries</div>
                    </div>
                )}
            </RwIconButton>
        </>
    );
}
