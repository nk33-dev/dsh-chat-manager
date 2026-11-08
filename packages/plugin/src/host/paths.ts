import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Where Harness keeps its profile data. `DSH_HOME` wins because the desktop
 * build sets it when the profile lives outside the default location; the
 * per-user default is the fallback.
 */
export function resolveDshHome(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.DSH_HOME?.trim();
  if (configured) return configured;
  return join(homedir(), ".dsh");
}

/** Layout of one Harness home, spelled once so no caller rebuilds it by hand. */
export interface DshPaths {
  home: string;
  /** One directory per project, each holding one directory per session. */
  sessions: string;
  /** Persisted projection cache; the session list reads titles from here. */
  projcache: string;
  /** Workspace records, including which sessions belong to which project. */
  workspace: string;
  /** This plugin's own state, kept out of every Harness-owned file. */
  own: string;
  trash: string;
}

export function dshPaths(home: string): DshPaths {
  const own = join(home, "chat-manager");
  return {
    home,
    sessions: join(home, "sessions"),
    projcache: join(home, "storages", "session_projcache", "sessions"),
    workspace: join(home, "storages", "workspace.json"),
    own,
    trash: join(own, "trash"),
  };
}

/** `<uuid>` on disk vs `session-<uuid>` in workspace records. */
export function bareSessionId(sessionId: string): string {
  return sessionId.startsWith("session-")
    ? sessionId.slice("session-".length)
    : sessionId;
}

/** Two spellings of the same id: the stored one and the on-disk one. */
export function sessionIdVariants(sessionId: string): string[] {
  const bare = bareSessionId(sessionId);
  return bare === sessionId ? [sessionId] : [sessionId, bare];
}

/**
 * Compare a stored cwd with a candidate the same way Harness does when it
 * groups sessions: case-insensitive on Windows, tolerant of trailing
 * separators and either slash.
 */
export function sameDirectory(left: string, right: string): boolean {
  const normalize = (value: string) =>
    value.replace(/[\\/]+$/, "").replace(/\\/g, "/").toLowerCase();
  return normalize(left) === normalize(right);
}

/** Last path segment, used as a readable project label. */
export function directoryLabel(path: string): string {
  const parts = path.replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts.at(-1) ?? path;
}
