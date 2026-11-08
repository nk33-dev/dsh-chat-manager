import { type DshPaths } from "./paths.ts";
/** Where a session sat in its project's order, so a restore puts it back. */
export interface WorkspaceSlot {
    workspaceId: string;
    index: number;
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
export declare function detachFromWorkspace(paths: DshPaths, sessionId: string): Promise<WorkspaceSlot | undefined>;
/** Put a session back where `detachFromWorkspace` found it. Missing projects are skipped. */
export declare function reattachToWorkspace(paths: DshPaths, sessionId: string, slot: WorkspaceSlot | undefined): Promise<boolean>;
/** Copy the workspace document beside a trash entry, so a restore has the original. */
export declare function snapshotWorkspace(paths: DshPaths, destination: string): Promise<void>;
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
export declare function readWorkspaceRecord(paths: DshPaths, workspaceId: string): Promise<RemovedWorkspace | undefined>;
