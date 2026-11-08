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
/**
 * Move a session's log and cache entry out of Harness's directories into this
 * plugin's trash, recording enough to put both back.
 * @returns the trash handle and whether the log itself was moved.
 */
export declare function trashSession(paths: DshPaths, stored: StoredSession, options: {
    sessionId: string;
    title?: string;
    workspace: WorkspaceSlot | undefined;
    /** Set when the parent workspace is being deleted as part of this request. */
    workspaceDeleted?: RemovedWorkspace;
}): Promise<TrashedResult>;
export declare function readManifest(directory: string): Promise<TrashManifest | undefined>;
/** Every readable trash entry, newest first. Unreadable directories are skipped, not reported. */
export declare function listTrash(paths: DshPaths): Promise<TrashEntry[]>;
/** Move a session's parts back to where the manifest says they came from. */
export declare function restoreSession(paths: DshPaths, trashId: string): Promise<TrashManifest | undefined>;
/** Delete a trash entry for good. */
export declare function purgeTrash(paths: DshPaths, trashId: string): Promise<boolean>;
/** The entry directory name, used when a caller only has an absolute path. */
export declare function trashIdOf(path: string): string;
