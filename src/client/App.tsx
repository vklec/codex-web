import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { IconTerminal } from './icons';
import { Workspace, type RepoInfo } from './Workspace';
import { TerminalPage } from './TerminalPage';

type Route = 'workspace' | 'terminal';

const LAST_ACTIVE_REPO_KEY = 'codex.lastActiveRepoPath.v1';

const getRouteFromLocation = (): Route => {
  if (typeof window === 'undefined') return 'workspace';
  if (window.location.pathname.startsWith('/terminal')) return 'terminal';
  return 'workspace';
};

const pushRoute = (route: Route) => {
  if (typeof window === 'undefined') return;
  const nextPath = route === 'terminal' ? '/terminal' : '/';
  if (window.location.pathname !== nextPath) {
    window.history.pushState({}, '', nextPath);
  }
};

const readLastActiveRepoPath = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LAST_ACTIVE_REPO_KEY);
    return raw && raw.trim().length > 0 ? raw : null;
  } catch {
    return null;
  }
};

const writeLastActiveRepoPath = (repoPath: string) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LAST_ACTIVE_REPO_KEY, repoPath);
  } catch {
    // ignore
  }
};

export default function App() {
  const [route, setRoute] = useState<Route>(() => getRouteFromLocation());
  const [activeRepo, setActiveRepo] = useState<RepoInfo | null>(null);

  const [authed, setAuthed] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [pendingLogin, setPendingLogin] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loginFields, setLoginFields] = useState({ username: '', password: '' });

  const navigate = useCallback((next: Route) => {
    pushRoute(next);
    setRoute(next);
  }, []);

  const checkSession = useCallback(async () => {
    setCheckingSession(true);
    setAuthError(null);
    try {
      const res = await fetch('/api/health', { credentials: 'include' });
      if (res.ok) {
        setAuthed(true);
      } else if (res.status === 401) {
        setAuthed(false);
      } else {
        setAuthed(false);
        setAuthError(`Server error (HTTP ${res.status})`);
      }
    } catch (err) {
      setAuthed(false);
      setAuthError(err instanceof Error ? err.message : 'Failed to reach server');
    } finally {
      setCheckingSession(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  useEffect(() => {
    const onPop = () => setRoute(getRouteFromLocation());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const handleLogin = useCallback(async () => {
    setPendingLogin(true);
    setAuthError(null);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          username: loginFields.username,
          password: loginFields.password,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg = typeof body?.error === 'string' ? body.error : `HTTP ${res.status}`;
        setAuthed(false);
        setAuthError(msg);
        return;
      }
      await checkSession();
    } catch (err) {
      setAuthed(false);
      setAuthError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setPendingLogin(false);
    }
  }, [checkSession, loginFields.password, loginFields.username]);

  const BrandLogo = useMemo(
    () =>
      function BrandLogoInner({ active }: { active: boolean }) {
        return (
          <div className="header-branding">
            <IconTerminal className="brand-icon" />
            <span>Codex</span>
            {active && (
              <div className="typing-dots" style={{ marginLeft: 8 }}>
                <span />
                <span />
                <span />
              </div>
            )}
          </div>
        );
      },
    [],
  );

  useEffect(() => {
    if (!authed) return;
    if (route !== 'terminal') return;
    if (activeRepo) return;

    const lastPath = readLastActiveRepoPath();
    if (!lastPath) {
      navigate('workspace');
      return;
    }

    (async () => {
      try {
        const res = await fetch('/api/repos', { credentials: 'include' });
        if (!res.ok) {
          navigate('workspace');
          return;
        }
        const data = (await res.json()) as { repos?: RepoInfo[] };
        const repo = Array.isArray(data.repos) ? data.repos.find((r) => r.path === lastPath) : null;
        if (repo) {
          setActiveRepo(repo);
          return;
        }
        navigate('workspace');
      } catch {
        navigate('workspace');
      }
    })();
  }, [activeRepo, authed, navigate, route]);

  if (!authed) {
    return (
      <div className="app-shell login-shell">
        <header className="app-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <BrandLogo active={checkingSession || pendingLogin} />
          </div>
        </header>
        <section className="login-panel">
          {checkingSession ? (
            <p className="login-status">Checking session…</p>
          ) : (
            <form
              className="login-form"
              onSubmit={(e) => {
                e.preventDefault();
                handleLogin();
              }}
            >
              <input
                type="text"
                value={loginFields.username}
                autoComplete="username"
                onChange={(e) => setLoginFields((prev) => ({ ...prev, username: e.target.value }))}
                placeholder="Username"
              />
              <input
                type="password"
                value={loginFields.password}
                autoComplete="current-password"
                onChange={(e) => setLoginFields((prev) => ({ ...prev, password: e.target.value }))}
                placeholder="Password"
              />
              {authError && <div className="login-error">{authError}</div>}
              <button type="submit" disabled={pendingLogin}>
                {pendingLogin ? 'Signing in…' : 'Sign In'}
              </button>
            </form>
          )}
        </section>
      </div>
    );
  }

  if (route === 'terminal' && activeRepo) {
    return <TerminalPage repo={activeRepo} onBack={() => navigate('workspace')} />;
  }

  return (
    <div className="app-shell">
      <header className="app-header app-header-workspace">
        <div className="header-row header-row-workspace">
          <BrandLogo active={false} />
        </div>
      </header>
      <Workspace
        onOpenTerminal={(repo) => {
          setActiveRepo(repo);
          writeLastActiveRepoPath(repo.path);
          navigate('terminal');
        }}
        activeRepo={activeRepo}
      />
    </div>
  );
}
