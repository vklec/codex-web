import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';
import { config } from './config.js';

export type RepoInfo = {
  name: string;
  path: string;
  relativePath: string;
  isGit: boolean;
  mtimeMs: number;
  favorite: boolean;
};

const favoritesFile = path.resolve(config.dataDir, 'repo-favorites.json');

const normalizePath = (input: string) => {
  const resolved = path.resolve(input);
  const root = config.repoRoot;
  if (resolved === root) return resolved;
  const withSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (!resolved.startsWith(withSep)) {
    throw new Error('Path outside allowed root');
  }
  return resolved;
};

const ensureFavorites = async (): Promise<string[]> => {
  try {
    await fsp.mkdir(path.dirname(favoritesFile), { recursive: true });
    if (!fs.existsSync(favoritesFile)) {
      await fsp.writeFile(favoritesFile, JSON.stringify({ favorites: [] }, null, 2), 'utf8');
      return [];
    }
    const raw = await fsp.readFile(favoritesFile, 'utf8');
    const parsed = JSON.parse(raw) as { favorites?: unknown };
    const favorites = Array.isArray(parsed.favorites)
      ? parsed.favorites.filter((p): p is string => typeof p === 'string')
      : [];
    return favorites;
  } catch (error) {
    console.error('[repos] failed to load favorites', error);
    return [];
  }
};

const persistFavorites = async (favorites: string[]) => {
  try {
    await fsp.mkdir(path.dirname(favoritesFile), { recursive: true });
    await fsp.writeFile(favoritesFile, JSON.stringify({ favorites }, null, 2), 'utf8');
  } catch (error) {
    console.error('[repos] failed to persist favorites', error);
  }
};

export const setFavorites = async (paths: string[]) => {
  const sanitized = Array.from(
    new Set(
      paths
        .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
        .map((p) => normalizePath(path.resolve(config.repoRoot, p))),
    ),
  );
  await persistFavorites(sanitized);
  return sanitized;
};

export const getFavorites = async () => ensureFavorites();

export const listRepos = async (): Promise<RepoInfo[]> => {
  const entries = await fsp.readdir(config.repoRoot, { withFileTypes: true });
  const favorites = await ensureFavorites();
  const favoriteSet = new Set(favorites);
  const repos: RepoInfo[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const fullPath = path.resolve(config.repoRoot, entry.name);
    try {
      const stat = await fsp.stat(fullPath);
      const gitPath = path.join(fullPath, '.git');
      const isGit = fs.existsSync(gitPath);
      const relativePath = path.relative(config.repoRoot, fullPath) || entry.name;
      repos.push({
        name: entry.name,
        path: fullPath,
        relativePath,
        isGit,
        mtimeMs: stat.mtimeMs,
        favorite: favoriteSet.has(fullPath),
      });
    } catch (error) {
      console.warn('[repos] skip entry', fullPath, error);
    }
  }

  repos.sort((a, b) => {
    const aFav = a.favorite ? favorites.indexOf(a.path) : Number.MAX_SAFE_INTEGER;
    const bFav = b.favorite ? favorites.indexOf(b.path) : Number.MAX_SAFE_INTEGER;
    if (aFav !== bFav) return aFav - bFav;
    return a.name.localeCompare(b.name);
  });

  return repos;
};

export const validateRepoPath = (input: string) => normalizePath(input);
