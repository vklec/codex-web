import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import 'xterm/css/xterm.css';
import { IconChevronLeft, IconTerminal, IconTrash } from './icons';
import type { RepoInfo } from './Workspace';

type TerminalStatus = 'idle' | 'running' | 'exited';

type Props = {
    repo: RepoInfo;
    onBack: () => void;
};

export function TerminalPage({ repo, onBack }: Props) {
    const [status, setStatus] = useState<TerminalStatus>('idle');
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const termRef = useRef<Terminal | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const fitRef = useRef<FitAddon | null>(null);
    const eventSourceRef = useRef<EventSource | null>(null);
    const resizeHandlerRef = useRef<(() => void) | null>(null);
    const inputQueueRef = useRef<string>('');
    const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const sendQueueRef = useRef<Promise<void>>(Promise.resolve());
    const resizeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const sessionIdRef = useRef<string | null>(null);
    const streamSidRef = useRef<string | null>(null);

    // Session management helpers
    const SESSION_STORAGE_KEY = 'codex-workspace-sessions';

    const getStoredSession = (path: string): string | null => {
        try {
            const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed[path]?.sessionId || null;
        } catch {
            return null;
        }
    };

    const storeSession = (path: string, sid: string) => {
        try {
            const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
            const data = raw ? JSON.parse(raw) : {};
            data[path] = { path, sessionId: sid, createdAt: Date.now() };
            window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.error('Failed to store session', e);
        }
    };

    const clearStoredSession = (path: string) => {
        try {
            const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
            if (!raw) return;
            const data = JSON.parse(raw);
            delete data[path];
            window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.error('Failed to clear session', e);
        }
    };

    const stopStream = () => {
        eventSourceRef.current?.close();
        eventSourceRef.current = null;
        streamSidRef.current = null;
    };

    const sendResize = (cols: number, rows: number) => {
        const sid = sessionIdRef.current;
        if (!sid || !Number.isFinite(cols) || !Number.isFinite(rows)) return;
        if (resizeDebounceRef.current) clearTimeout(resizeDebounceRef.current);
        resizeDebounceRef.current = setTimeout(() => {
            fetch(`/api/terminal/${sid}/resize`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ cols, rows }),
            }).catch(() => undefined);
        }, 50);
    };

    const sendInput = async (text: string, enter = false) => {
        const sid = sessionIdRef.current;
        if (!sid) return;
        await fetch(`/api/terminal/${sid}/input`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ data: text, enter }),
        });
    };

    const flushInputQueue = (enter = false) => {
        const data = inputQueueRef.current;
        inputQueueRef.current = '';
        if (flushTimerRef.current) {
            clearTimeout(flushTimerRef.current);
            flushTimerRef.current = null;
        }
        if (!enter && data.length === 0) return;
        const payloadData = data;
        sendQueueRef.current = sendQueueRef.current
            .catch(() => undefined)
            .then(() => sendInput(payloadData, enter))
            .catch(() => undefined);
    };

    const initTerminal = (sid: string) => {
        // Terminal is created once per page instance, but the session id can change (dev StrictMode / retries).
        // If the terminal already exists, ensure the stream is connected to the requested session.
        if (termRef.current) {
            if (streamSidRef.current === sid && eventSourceRef.current) return;
            stopStream();
            const es = new EventSource(`/api/terminal/${sid}/stream`, { withCredentials: true });
            eventSourceRef.current = es;
            streamSidRef.current = sid;

            es.onmessage = (ev) => {
                try {
                    const parsed = JSON.parse(ev.data);
                    if (parsed.type === 'init' && parsed.data) {
                        termRef.current?.write(parsed.data);
                    } else if (parsed.type === 'data' && parsed.data) {
                        termRef.current?.write(parsed.data);
                    } else if (parsed.type === 'exit') {
                        sessionIdRef.current = null;
                        setSessionId(null);
                        setStatus('exited');
                        clearStoredSession(repo.path);
                        stopStream();
                    }
                } catch { }
            };

            es.onerror = () => {
                sessionIdRef.current = null;
                setSessionId(null);
                setStatus('exited');
                stopStream();
            };
            return;
        }

        const term = new Terminal({
            convertEol: false,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 13,
            theme: {
                background: '#0f172a',
                foreground: '#e2e8f0',
                cursor: '#e2e8f0',
            },
        });
        termRef.current = term;

        // Custom key handler for scrolling
        term.attachCustomKeyEventHandler(() => {
            // Allow default behavior but ensure focus stays
            return true;
        });

        const fit = new FitAddon();
        fitRef.current = fit;
        term.loadAddon(fit);

        if (containerRef.current) {
            term.open(containerRef.current);
            try {
                fit.fit();
            } catch { }
        }

        term.onData((chunk) => {
            if (chunk === '\r') {
                flushInputQueue(true);
                return;
            }
            inputQueueRef.current += chunk;
            if (!flushTimerRef.current) {
                flushTimerRef.current = setTimeout(() => flushInputQueue(false), 30);
            }
        });

        // Handle resize
        const handleResize = () => {
            try {
                fit.fit();
                sendResize(term.cols, term.rows);
            } catch { }
        };
        window.addEventListener('resize', handleResize);
        resizeHandlerRef.current = handleResize;

        // Connect stream
        const es = new EventSource(`/api/terminal/${sid}/stream`, { withCredentials: true });
        eventSourceRef.current = es;
        streamSidRef.current = sid;

        es.onmessage = (ev) => {
            try {
                const parsed = JSON.parse(ev.data);
                if (parsed.type === 'init' && parsed.data) {
                    term.write(parsed.data);
                    // Initial resize after content
                    setTimeout(handleResize, 100);
                } else if (parsed.type === 'data' && parsed.data) {
                    term.write(parsed.data);
                } else if (parsed.type === 'exit') {
                    sessionIdRef.current = null;
                    setSessionId(null);
                    setStatus('exited');
                    clearStoredSession(repo.path);
                    stopStream();
                }
            } catch { }
        };

        es.onerror = () => {
            sessionIdRef.current = null;
            setSessionId(null);
            setStatus('exited');
            stopStream();
        };

        // Initial focus
        term.focus();

        // Initial resize
        setTimeout(handleResize, 50);
    };

    const startOrResumeSession = async () => {
        setError(null);
        try {
            // Check for existing session
            const storedSid = getStoredSession(repo.path);
            if (storedSid) {
                // Verify it's still valid
                const res = await fetch(`/api/terminal/${storedSid}`, { credentials: 'include' });
                if (res.ok) {
                    const info = await res.json();
                    if (info.cwd === repo.path) {
                        sessionIdRef.current = storedSid;
                        setSessionId(storedSid);
                        setStatus('running');
                        initTerminal(storedSid);
                        return;
                    }
                }
                // Invalid or mismatch, clear it
                clearStoredSession(repo.path);
            }

            // Start new
            const res = await fetch('/api/terminal/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ path: repo.path }),
            });

            if (!res.ok) throw new Error('Failed to start terminal');

            const data = await res.json();
            sessionIdRef.current = data.sessionId;
            setSessionId(data.sessionId);
            storeSession(repo.path, data.sessionId);
            setStatus('running');
            initTerminal(data.sessionId);

        } catch (err) {
            sessionIdRef.current = null;
            setSessionId(null);
            setError(err instanceof Error ? err.message : 'Failed to start terminal');
            setStatus('exited');
        }
    };

    useEffect(() => {
        startOrResumeSession();
        return () => {
            stopStream();
            if (resizeHandlerRef.current) {
                window.removeEventListener('resize', resizeHandlerRef.current);
            }
            termRef.current?.dispose();
        };
    }, [repo.path]);

    const handleClear = () => {
        termRef.current?.reset();
        fitRef.current?.fit();
    };

    const handleStop = async () => {
        const sid = sessionIdRef.current;
        if (!sid) return;
        try {
            await fetch(`/api/terminal/${sid}/stop`, {
                method: 'POST',
                credentials: 'include',
            });
            // Stream will close on exit event
        } catch { }
    };

    return (
        <div className="terminal-page">
            <div className="terminal-page-header">
                <button className="ghost-btn" onClick={onBack}>
                    <IconChevronLeft /> Back
                </button>
                <div className="terminal-page-title">
                    <IconTerminal /> {repo.relativePath}
                </div>
                <div className="terminal-page-actions">
                    <button className="ghost-btn" onClick={handleClear} title="Clear">
                        <IconTrash />
                    </button>
                    <button
                        className="ghost-btn"
                        onClick={() => sendInput('\u0003')}
                        title="Ctrl+C"
                    >
                        Ctrl+C
                    </button>
                </div>
            </div>

            {error && <div className="pill-inline error">Error: {error}</div>}

            <div className="terminal-page-content">
                <div className="terminal-xterm-container" ref={containerRef} />
            </div>

            {status === 'exited' && (
                <div className="terminal-page-footer">
                    <div className="status-message">Session ended</div>
                    <button className="primary-btn" onClick={() => {
                        termRef.current?.dispose();
                        termRef.current = null;
                        startOrResumeSession();
                    }}>
                        Restart Session
                    </button>
                </div>
            )}
        </div>
    );
}
