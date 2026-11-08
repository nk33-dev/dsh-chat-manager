/** Wire types shared by the Host and the browser half. */
export type Json = null | boolean | number | string | Json[] | {
    [key: string]: Json;
};
export interface RpcRequest {
    action: string;
    payload: Json;
}
export interface RpcResponse {
    ok: boolean;
    data: Json;
    error: string;
}
/** One session waiting in the trash, as the browser half sees it. */
export interface TrashEntry {
    /** Directory name inside the trash root; the handle for restore and purge. */
    trashId: string;
    /** Session id as Harness stores it, including the `session-` prefix when present. */
    sessionId: string;
    title: string;
    cwd: string;
    deletedAt: number;
    /** Bytes the moved log occupies, or 0 when it could not be measured. */
    sizeBytes: number;
    /** True when the log file was found and moved; false when only caches were. */
    hasLog: boolean;
}
/** What a delete reports back so the browser half can offer an undo. */
export interface DeleteResult {
    trashId: string;
    sessionId: string;
    title: string;
    trashed: boolean;
    /** Present when the session was archived but its files stayed put. */
    warning: string;
}
/** One row in the searchable session list. */
export interface SessionRow {
    sessionId: string;
    title: string;
    cwd: string;
    updatedAt: number;
    archived: boolean;
    /** Working state reported by the Host, so the caller can warn before deleting. */
    running: boolean;
}
/**
 * What the last workspace delete did.
 *
 * The dialog that triggers it belongs to the Host and cannot be changed, so its
 * wording still promises the sessions survive. This record is how the plugin
 * tells the truth afterwards: the panel shows it, with the trash entries the
 * delete produced.
 */
export interface WorkspaceDeleteReport {
    workspaceId: string;
    title: string;
    /** Every session the delete tried to remove. */
    sessionIds: string[];
    /** Trash handles for the ones that actually landed in the trash. */
    trashIds: string[];
    /** Sessions that refused, in `title: reason` form. */
    warnings: string[];
    at: number;
}
