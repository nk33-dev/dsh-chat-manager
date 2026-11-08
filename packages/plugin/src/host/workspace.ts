import { readFile, rename, writeFile, mkdir, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { sessionIdVariants, type DshPaths } from "./paths.ts";

/** Where a session sat in its project's order, so a restore puts it back. */
export interface WorkspaceSlot {
  workspaceId: string;
  index: number;
}

/** The parts of `workspace.json` this plugin touches; everything else is passed through. */
interface WorkspaceDocument {
  global?: {
    workspaceIds?: string[];
    archivedSessionIds?: string[];
    pinnedSessionIds?: string[];
    [key: string]: unknown;
  };
  tables?: {
    workspaces?: Record<
      string,
      {
        path?: string;
        title?: string;
        sessionIds?: string[];
        [key: string]: unknown;
      }
    >;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

async function readDocument(paths: DshPaths): Promise<WorkspaceDocument> {
  try {
    return JSON.parse(await readFile(paths.workspace, "utf8")) as WorkspaceDocument;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return {};
    throw error;
  }
}

/**
 * Write through a sibling temp file and rename over the original, so a crash
 * mid-write leaves the previous document intact rather than a truncated one.
 */
async function writeDocument(paths: DshPaths, document: WorkspaceDocument): Promise<void> {
  await mkdir(dirname(paths.workspace), { recursive: true });
  const temp = join(dirname(paths.workspace), `workspace.json.chat-manager-${process.pid}.tmp`);
  await writeFile(temp, `${JSON.stringify(document, null, 1)}\n`, "utf8");
  await rename(temp, paths.workspace);
}

/**
 * Drop a session from its project's list and from the global pin set.
 *
 * The archive set is deliberately left alone: the Host owns it, and removing
 * the id there would unarchive the session the delete just archived — the row
 * would come straight back. A restore lifts the archive through the official
 * API instead of editing this file.
 * @returns the project and position it held, or undefined when it held none.
 */
export async function detachFromWorkspace(
  paths: DshPaths,
  sessionId: string,
): Promise<WorkspaceSlot | undefined> {
  const document = await readDocument(paths);
  const workspaces = document.tables?.workspaces;
  const variants = new Set(sessionIdVariants(sessionId));
  let slot: WorkspaceSlot | undefined;
  let changed = false;

  if (workspaces !== undefined) {
    for (const [workspaceId, workspace] of Object.entries(workspaces)) {
      const ids = workspace.sessionIds;
      if (!Array.isArray(ids)) continue;
      const index = ids.findIndex((id) => variants.has(id));
      if (index === -1) continue;
      slot = { workspaceId, index };
      workspace.sessionIds = ids.filter((_, at) => at !== index);
      changed = true;
      break;
    }
  }

  const global = document.global;
  if (global !== undefined) {
    const pinned = global.pinnedSessionIds;
    if (Array.isArray(pinned)) {
      const filtered = pinned.filter((id) => !variants.has(id));
      if (filtered.length !== pinned.length) {
        global.pinnedSessionIds = filtered;
        changed = true;
      }
    }
  }

  if (changed) await writeDocument(paths, document);
  return slot;
}

/** Put a session back where `detachFromWorkspace` found it. Missing projects are skipped. */
export async function reattachToWorkspace(
  paths: DshPaths,
  sessionId: string,
  slot: WorkspaceSlot | undefined,
): Promise<boolean> {
  if (slot === undefined) return false;
  const document = await readDocument(paths);
  const workspace = document.tables?.workspaces?.[slot.workspaceId];
  if (workspace === undefined) return false;
  const ids = workspace.sessionIds ?? [];
  if (ids.some((id) => id === sessionId)) return false;
  // The position may be past the end if the project shrank while the session
  // was away; clamping keeps it adjacent to where it was.
  const at = Math.min(slot.index, ids.length);
  workspace.sessionIds = [...ids.slice(0, at), sessionId, ...ids.slice(at)];
  await writeDocument(paths, document);
  return true;
}

/** Copy the workspace document beside a trash entry, so a restore has the original. */
export async function snapshotWorkspace(paths: DshPaths, destination: string): Promise<void> {
  try {
    await copyFile(paths.workspace, destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
}

/**
 * A workspace registration the delete removed, recorded so an undo can put it
 * back. Only what `registry.create` needs plus the order its sessions held.
 */
export interface RemovedWorkspace {
  workspaceId: string;
  path: string;
  title: string;
  /** Session ids in their original order, so a rebuild restores the arrangement. */
  sessionIds: string[];
}

/** Read one workspace record out of the durable document without touching the Host. */
export async function readWorkspaceRecord(
  paths: DshPaths,
  workspaceId: string,
): Promise<RemovedWorkspace | undefined> {
  const document = await readDocument(paths);
  const workspace = document.tables?.workspaces?.[workspaceId];
  if (workspace === undefined) return undefined;
  const sessionIds = Array.isArray(workspace.sessionIds) ? workspace.sessionIds : [];
  return {
    workspaceId,
    path: typeof workspace.path === "string" ? workspace.path : "",
    title: typeof workspace.title === "string" ? workspace.title : "",
    sessionIds: [...sessionIds],
  };
}
