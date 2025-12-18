import React, { useEffect, useMemo, useState } from 'react';
import { IconFolder, IconStar, IconTerminal } from './icons';

export type RepoInfo = {
  name: string;
  path: string;
  relativePath: string;
  isGit: boolean;
  mtimeMs: number;
  favorite: boolean;
};

type RepoResponse = {
  root: string;
  repos: RepoInfo[];
  favorites: string[];
};

type StoredSession = {
  sessionId: string;
  path: string;
  createdAt: number;
};

const SESSION_STORAGE_KEY = 'codex-workspace-sessions';

const formatDate = (value: number) => {
  if (!value) return '';
  const dt = new Date(value);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  const hh = String(dt.getHours()).padStart(2, '0');
  const mm = String(dt.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}`;
};

type Props = {
  onBack?: () => void;
  onOpenTerminal: (repo: RepoInfo) => void;
  activeRepo: RepoInfo | null;
};

export function Workspace({ onBack, onOpenTerminal, activeRepo }: Props) {
  const [repos, setRepos] = useState<RepoInfo[]>([]);
  const [root, setRoot] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [persistedSessions, setPersistedSessions] = useState<Record<string, StoredSession>>({});

  const readStoredSessions = (): Record<string, StoredSession> => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw) as Record<string, Partial<StoredSession>>;
      if (!parsed || typeof parsed !== 'object') return {};
      const result: Record<string, StoredSession> = {};
      Object.entries(parsed).forEach(([path, value]) => {
        if (value && typeof value.sessionId === 'string') {
          result[path] = {
            path,
            sessionId: value.sessionId,
            createdAt: typeof value.createdAt === 'number' ? value.createdAt : Date.now(),
          } satisfies StoredSession;
        }
      });
      return result;
    } catch (err) {
      console.error('[workspace] failed to read stored sessions', err);
      return {};
    }
  };

  const loadRepos = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/repos', { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as RepoResponse;
      setRoot(data.root);
      setRepos(data.repos);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load repos');
    } finally {
      setLoading(false);
    }
  };

  const setFavorites = async (paths: string[]) => {
    const res = await fetch('/api/repos/favorites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ favorites: paths }),
    });
    if (!res.ok) throw new Error('Failed to save favorites');
  };

  const toggleFavorite = async (repo: RepoInfo) => {
    const currentFavorites = repos.filter((r) => r.favorite).map((r) => r.path);
    const next = repo.favorite
      ? currentFavorites.filter((p) => p !== repo.path)
      : [repo.path, ...currentFavorites];
    try {
      await setFavorites(next);
      await loadRepos();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update favorites');
    }
  };

  useEffect(() => {
    // Refresh sessions from storage periodically or on focus to keep sync
    const updateSessions = () => {
      setPersistedSessions(readStoredSessions());
    };
    updateSessions();
    window.addEventListener('focus', updateSessions);
    return () => window.removeEventListener('focus', updateSessions);
  }, []);

  useEffect(() => {
    loadRepos();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter((r) =>
      r.name.toLowerCase().includes(q) ||
      r.relativePath.toLowerCase().includes(q),
    );
  }, [repos, query]);

  const favoriteRepos = useMemo(() => filtered.filter((r) => r.favorite), [filtered]);
  const otherRepos = useMemo(() => filtered.filter((r) => !r.favorite), [filtered]);

  return (
    <div className="workspace">
      <div className="workspace-header">
        <div>
          <div className="workspace-title">Repos @ {root || 'loading...'}</div>
          <div className="workspace-subtitle">Pick a repo, favorite it, then start Codex in-place.</div>
        </div>
      </div>
      <div className="workspace-search">
        <input
          type="search"
          placeholder="Search repos..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query.trim().length > 0 && (
          <button className="ghost-btn" type="button" onClick={() => setQuery('')}>
            Clear
          </button>
        )}
      </div>

      {error && <div className="pill-inline error">Error: {error}</div>}

      {Object.values(persistedSessions).length > 0 && (
        <div className="active-terminals-section">
          <div className="repo-section-title">Active Terminals</div>
          {Object.values(persistedSessions).map((session) => {
            const repo = repos.find((r) => r.path === session.path);
            if (!repo) return null;
            return (
              <div key={session.path} className="active-terminal-bar" onClick={() => onOpenTerminal(repo)}>
                <div className="active-terminal-info">
                  <div className="active-terminal-label">Running</div>
                  <div className="active-terminal-name"><IconTerminal /> {repo.relativePath}</div>
                </div>
                <button className="ghost-btn">Open</button>
              </div>
            );
          })}
        </div>
      )}

      <div className="repo-grid">
        {favoriteRepos.length > 0 && (
          <div className="repo-section">
            <div className="repo-section-title">Favorites</div>
            <div className="repo-list">
              {favoriteRepos.map((repo) => {
                const session = persistedSessions[repo.path];
                return (
                  <RepoCard
                    key={repo.path}
                    repo={repo}
                    sessionId={session?.sessionId}
                    onOpen={() => onOpenTerminal(repo)}
                    onFavorite={() => toggleFavorite(repo)}
                  />
                );
              })}
            </div>
          </div>
        )}
        <div className="repo-section">
          <div className="repo-section-title">All Repos</div>
          <div className="repo-list">
            {otherRepos.map((repo) => {
              const session = persistedSessions[repo.path];
              return (
                <RepoCard
                  key={repo.path}
                  repo={repo}
                  sessionId={session?.sessionId}
                  onOpen={() => onOpenTerminal(repo)}
                  onFavorite={() => toggleFavorite(repo)}
                />
              );
            })}
            {otherRepos.length === 0 && favoriteRepos.length === 0 && (
              <div className="repo-empty">No repos match your search.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

type RepoCardProps = {
  repo: RepoInfo;
  sessionId?: string;
  onOpen: () => void;
  onFavorite: () => void;
};

const RepoCard = ({ repo, onOpen, onFavorite, sessionId }: RepoCardProps) => {
  const hasActiveSession = Boolean(sessionId);
  return (
    <div className={`repo-card ${hasActiveSession ? 'running' : ''}`}>
      <div className="repo-card-top">
        <div className="repo-name">
          <IconFolder /> {repo.name}
        </div>
        <button className="icon-btn" onClick={onFavorite} title={repo.favorite ? 'Unfavorite' : 'Favorite'}>
          <IconStar filled={repo.favorite} />
        </button>
      </div>
      <div className="repo-meta">
        {repo.isGit && <span className="pill-inline pill-ghost">Git</span>}
        <span className="repo-date">Updated {formatDate(repo.mtimeMs)}</span>
      </div>
      <div className="repo-actions">
        <button
          className={hasActiveSession ? 'primary-btn success-btn' : 'ghost-btn'}
          onClick={onOpen}
        >
          <IconTerminal /> {hasActiveSession ? 'Continue' : 'Start Codex here'}
        </button>
      </div>
    </div>
  );
};
