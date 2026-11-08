import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { bareSessionId, sessionIdVariants, type DshPaths } from "./paths.ts";

/** Facts the plugin needs about one session's on-disk footprint. */
export interface StoredSession {
  /** Id as Harness records it, e.g. `session-<uuid>`; falls back to the bare id. */
  sessionId: string;
  /** Bare id: the project directory name and the projection file name. */
  bareId: string;
  /** Absolute path of the session's own directory, when one exists. */
  logDirectory?: string;
  /** Absolute path of the projection cache entry, when one exists. */
  projectionFile?: string;
  sizeBytes: number;
  /** Durable title read from the projection cache; empty when unavailable. */
  title: string;
  cwd: string;
}

/** The projection cache's title path, defensively drilled: the shape moves between versions. */
function readTitle(record: unknown): string {
  if (typeof record !== "object" || record === null) return "";
  const rows = (record as Record<string, unknown>).rows;
  if (typeof rows !== "object" || rows === null) return "";
  const title = (rows as Record<string, unknown>).title;
  if (typeof title === "string") return title;
  if (typeof title === "object" && title !== null) {
    const value = (title as Record<string, unknown>).val;
    if (typeof value === "string") return value;
  }
  return "";
}

function readCwd(record: unknown): string {
  if (typeof record !== "object" || record === null) return "";
  const identity = (record as Record<string, unknown>).identity;
  if (typeof identity !== "object" || identity === null) return "";
  const cwd = (identity as Record<string, unknown>).cwd;
  return typeof cwd === "string" ? cwd : "";
}

async function readProjection(path: string): Promise<{ title: string; cwd: string }> {
  try {
    const raw = JSON.parse(await readFile(path, "utf8")) as unknown;
    const record =
      typeof raw === "object" && raw !== null && "record" in raw
        ? (raw as Record<string, unknown>).record
        : raw;
    return { title: readTitle(record), cwd: readCwd(record) };
  } catch {
    // A cache entry that will not parse is still deletable; it just carries no
    // title or directory. Reading is the only thing that fails here.
    return { title: "", cwd: "" };
  }
}

async function sizeOfDirectory(directory: string): Promise<number> {
  let total = 0;
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) total += await sizeOfDirectory(path);
    else if (entry.isFile()) {
      try {
        total += (await stat(path)).size;
      } catch {
        // A file that vanished between listing and measuring contributes nothing.
      }
    }
  }
  return total;
}

/**
 * Locate every session on disk without assuming the project-directory naming
 * rule. The rule exists (`--D-Project-foo--`), but it is Harness's to change,
 * so the walk matches ids instead of rebuilding the pattern.
 */
export async function scanStoredSessions(paths: DshPaths): Promise<Map<string, StoredSession>> {
  const found = new Map<string, StoredSession>();

  const ensure = (name: string, presentAs: string): StoredSession => {
    const existing = found.get(name);
    if (existing !== undefined) return existing;
    const created: StoredSession = {
      sessionId: presentAs,
      bareId: bareSessionId(name),
      sizeBytes: 0,
      title: "",
      cwd: "",
    };
    found.set(name, created);
    return created;
  };

  let projects: string[] = [];
  try {
    projects = (await readdir(paths.sessions, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    // No sessions directory yet: an empty install, not an error.
  }
  for (const project of projects) {
    const projectPath = join(paths.sessions, project);
    let sessions: string[] = [];
    try {
      sessions = (await readdir(projectPath, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    } catch {
      continue;
    }
    for (const name of sessions) {
      // Harness has written both `<uuid>` and `session-<uuid>` as the directory
      // name across versions, and an install can hold both. The index key is
      // the name as written, so either spelling is addressable.
      const session = ensure(name, name);
      session.logDirectory = join(projectPath, name);
      session.sizeBytes = await sizeOfDirectory(session.logDirectory);
    }
  }

  let cacheFiles: string[] = [];
  try {
    cacheFiles = (await readdir(paths.projcache, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => entry.name);
  } catch {
    // Without a cache the list still works from the logs alone.
  }
  for (const file of cacheFiles) {
    const name = file.slice(0, -".json".length);
    const session = ensure(name, name);
    session.projectionFile = join(paths.projcache, file);
    const projection = await readProjection(session.projectionFile);
    session.title = projection.title;
    session.cwd = projection.cwd;
  }

  return found;
}

/**
 * One session's footprint, matching either id spelling.
 *
 * Callers hold the id Harness lists (`session-<uuid>`), while the files may sit
 * under that name or under the bare id.
 */
export async function findStoredSession(
  paths: DshPaths,
  sessionId: string,
): Promise<StoredSession | undefined> {
  const sessions = await scanStoredSessions(paths);
  for (const variant of sessionIdVariants(sessionId)) {
    const found = sessions.get(variant);
    if (found !== undefined) return found;
  }
  return undefined;
}
