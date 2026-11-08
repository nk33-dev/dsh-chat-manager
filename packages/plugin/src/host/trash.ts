import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import type { TrashEntry } from "../shared/types.ts";
import type { DshPaths } from "./paths.ts";
import type { StoredSession } from "./scan.ts";
import type { RemovedWorkspace, WorkspaceSlot } from "./workspace.ts";

/** Record persisted beside a trashed session; every field is needed to undo. */
export interface TrashManifest {
  version: 1;
  trashId: string;
  sessionId: string;
  bareId: string;
  title: string;
  cwd: string;
  deletedAt: number;
  sizeBytes: number;
  /** Absolute paths these parts occupied; the restore target. */
  original: {
    logDirectory?: string;
    projectionFile?: string;
  };
  /** Where the parts sit now, relative to the trash entry directory. */
  moved: {
    log?: string;
    projection?: string;
  };
  workspace: WorkspaceSlot | null;
  /**
   * Present when this trashed session came from a workspace delete: the whole
   * registration was removed, so an undo has to rebuild it before the session
   * has anywhere to land.
   */
  workspaceDeleted?: RemovedWorkspace;
  /** Bytes of the copied workspace document, for diagnosing a manual restore. */
  workspaceSnapshot: boolean;
}

export interface TrashedResult {
  trashId: string;
  manifest: TrashManifest;
  hasLog: boolean;
}

async function movePath(from: string, to: string): Promise<void> {
  try {
    await rename(from, to);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    // rename fails across volumes and, on Windows, while a reader holds the
    // handle; a copy-then-remove is the portable fallback.
    if (code !== "EXDEV" && code !== "EPERM" && code !== "EACCES") throw error;
    await mkdir(dirname(to), { recursive: true });
    await copyFile(from, to);
    await rm(from, { force: true });
  }
}

/**
 * Move a session's log and cache entry out of Harness's directories into this
 * plugin's trash, recording enough to put both back.
 * @returns the trash handle and whether the log itself was moved.
 */
export async function trashSession(
  paths: DshPaths,
  stored: StoredSession,
  options: {
    sessionId: string;
    title?: string;
    workspace: WorkspaceSlot | undefined;
    /** Set when the parent workspace is being deleted as part of this request. */
    workspaceDeleted?: RemovedWorkspace;
  },
): Promise<TrashedResult> {
  const trashId = randomUUID();
  const directory = join(paths.trash, trashId);
  await mkdir(directory, { recursive: true });

  const manifest: TrashManifest = {
    version: 1,
    trashId,
    // The id Harness knows: the archive set is keyed by it, so an undo that
    // stored only the on-disk name would unarchive nothing.
    sessionId: options.sessionId,
    bareId: stored.bareId,
    title: options.title?.trim() || stored.title || stored.bareId,
    cwd: stored.cwd,
    deletedAt: Date.now(),
    sizeBytes: stored.sizeBytes,
    original: {
      ...(stored.logDirectory === undefined ? {} : { logDirectory: stored.logDirectory }),
      ...(stored.projectionFile === undefined ? {} : { projectionFile: stored.projectionFile }),
    },
    moved: {},
    workspace: options.workspace ?? null,
    ...(options.workspaceDeleted === undefined
      ? {}
      : { workspaceDeleted: options.workspaceDeleted }),
    workspaceSnapshot: false,
  };

  if (stored.logDirectory !== undefined) {
    const target = join(directory, "log");
    await movePath(stored.logDirectory, target);
    manifest.moved.log = "log";
  }
  if (stored.projectionFile !== undefined) {
    const target = join(directory, "projection.json");
    await movePath(stored.projectionFile, target);
    manifest.moved.projection = "projection.json";
  }
  await writeManifest(directory, manifest);

  return {
    trashId,
    manifest,
    hasLog: manifest.moved.log !== undefined,
  };
}

async function writeManifest(directory: string, manifest: TrashManifest): Promise<void> {
  await writeFile(join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 1)}\n`, "utf8");
}

export async function readManifest(directory: string): Promise<TrashManifest | undefined> {
  try {
    const raw = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8")) as TrashManifest;
    return raw?.version === 1 ? raw : undefined;
  } catch {
    return undefined;
  }
}

/** Every readable trash entry, newest first. Unreadable directories are skipped, not reported. */
export async function listTrash(paths: DshPaths): Promise<TrashEntry[]> {
  let names: string[] = [];
  try {
    names = (await readdir(paths.trash, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return [];
  }
  const entries: TrashEntry[] = [];
  for (const name of names) {
    const manifest = await readManifest(join(paths.trash, name));
    if (manifest === undefined) continue;
    entries.push({
      trashId: manifest.trashId,
      sessionId: manifest.sessionId,
      title: manifest.title,
      cwd: manifest.cwd,
      deletedAt: manifest.deletedAt,
      sizeBytes: manifest.sizeBytes,
      hasLog: manifest.moved.log !== undefined,
    });
  }
  return entries.sort((left, right) => right.deletedAt - left.deletedAt);
}

/** Move a session's parts back to where the manifest says they came from. */
export async function restoreSession(
  paths: DshPaths,
  trashId: string,
): Promise<TrashManifest | undefined> {
  const directory = join(paths.trash, trashId);
  const manifest = await readManifest(directory);
  if (manifest === undefined) return undefined;

  const restore = async (relative: string | undefined, destination: string | undefined) => {
    if (relative === undefined || destination === undefined) return;
    const source = join(directory, relative);
    try {
      await stat(source);
    } catch {
      // Already restored by hand, or never moved: nothing to put back.
      return;
    }
    await mkdir(dirname(destination), { recursive: true });
    await movePath(source, destination);
  };

  await restore(manifest.moved.log, manifest.original.logDirectory);
  await restore(manifest.moved.projection, manifest.original.projectionFile);
  await rm(directory, { recursive: true, force: true });
  return manifest;
}

/** Delete a trash entry for good. */
export async function purgeTrash(paths: DshPaths, trashId: string): Promise<boolean> {
  const directory = join(paths.trash, trashId);
  try {
    await stat(directory);
  } catch {
    return false;
  }
  await rm(directory, { recursive: true, force: true });
  return true;
}

/** The entry directory name, used when a caller only has an absolute path. */
export function trashIdOf(path: string): string {
  return basename(path);
}
