import { nanoid } from 'nanoid';
import pty, { type IPty } from 'node-pty';
import EventEmitter from 'events';
import { validateRepoPath } from './repos.js';

type TerminalSession = {
  id: string;
  cwd: string;
  pty: IPty;
  createdAt: number;
  lastOutputAt: number;
  buffer: string[];
  closed: boolean;
};

type DataEvent = { type: 'data'; sessionId: string; data: string };
type ExitEvent = { type: 'exit'; sessionId: string; code: number | null; signal: number | null };
type TerminalEvent = DataEvent | ExitEvent;

const MAX_BUFFER_LINES = 2000;

type TerminalSessionInfo = {
  id: string;
  cwd: string;
  createdAt: number;
  lastOutputAt: number;
};

class TerminalManager extends EventEmitter {
  private sessions = new Map<string, TerminalSession>();
  private sessionByCwd = new Map<string, string>();

  startSession(cwdInput: string) {
    const cwd = validateRepoPath(cwdInput);
    const existingId = this.sessionByCwd.get(cwd);
    if (existingId) {
      const existing = this.sessions.get(existingId);
      if (existing && !existing.closed) return existing;
      this.sessionByCwd.delete(cwd);
    }
    const id = nanoid();
    const args: string[] = ['--yolo'];

    const term = pty.spawn('codex', args, {
      name: 'xterm-256color',
      cols: 120,
      rows: 32,
      cwd,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
      },
    });

    const session: TerminalSession = {
      id,
      cwd,
      pty: term,
      createdAt: Date.now(),
      lastOutputAt: Date.now(),
      buffer: [],
      closed: false,
    };

    let updateDismissed = false;

    term.onData((chunk) => {
      let data = chunk;
      if (data.includes('\u001b[6n')) {
        term.write('\u001b[1;1R');
        data = data.replace(/\u001b\[6n/g, '');
      }
      if (!updateDismissed && data.toLowerCase().includes('update available')) {
        updateDismissed = true;
        term.write('2\r');
        return;
      }
      session.buffer.push(data);
      session.lastOutputAt = Date.now();
      if (session.buffer.length > MAX_BUFFER_LINES) {
        session.buffer.splice(0, session.buffer.length - MAX_BUFFER_LINES);
      }
      this.emit('event', { type: 'data', sessionId: id, data } satisfies DataEvent);
    });

    term.onExit(({ exitCode, signal }) => {
      session.closed = true;
      const code = typeof exitCode === 'number' ? exitCode : null;
      const sig = typeof signal === 'number' ? signal : null;
      this.emit('event', { type: 'exit', sessionId: id, code, signal: sig } satisfies ExitEvent);
      this.sessionByCwd.delete(session.cwd);
      this.sessions.delete(id);
    });

    this.sessions.set(id, session);
    this.sessionByCwd.set(cwd, id);
    return session;
  }

  write(sessionId: string, data: string, enter = false) {
    const session = this.sessions.get(sessionId);
    if (!session || session.closed) throw new Error('session not found');
    const payload = typeof data === 'string' ? data : '';
    const fullPayload = enter ? `${payload}\r` : payload;
    console.log('[terminal] write', { sessionId, payload, enter });
    if (fullPayload.length) {
      session.pty.write(fullPayload);
    }
  }

  resize(sessionId: string, cols: number, rows: number) {
    const session = this.sessions.get(sessionId);
    if (!session || session.closed) throw new Error('session not found');
    session.pty.resize(Math.max(20, cols || 80), Math.max(8, rows || 24));
  }

  stop(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    try {
      session.pty.kill('SIGKILL');
    } catch (error) {
      console.error('[terminal] failed to kill session', sessionId, error);
    } finally {
      this.sessionByCwd.delete(session.cwd);
      this.sessions.delete(sessionId);
    }
  }

  getSession(sessionId: string) {
    return this.sessions.get(sessionId) ?? null;
  }

  getSessionInfo(sessionId: string): TerminalSessionInfo | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return {
      id: session.id,
      cwd: session.cwd,
      createdAt: session.createdAt,
      lastOutputAt: session.lastOutputAt,
    } satisfies TerminalSessionInfo;
  }
}

export const terminalManager = new TerminalManager();
export type { TerminalSession, TerminalEvent, DataEvent, ExitEvent, TerminalSessionInfo };
