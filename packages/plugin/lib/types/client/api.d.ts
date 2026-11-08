import type { RemoteResult } from "@deepseek-ai/dsh-typert-protocol";
import type { DeleteResult, RpcRequest, RpcResponse, SessionRow, TrashEntry, WorkspaceDeleteReport } from "../shared/types.ts";
/** The mounted Remote namespace the Host registers under `chatmanager`. */
export interface RemoteNamespace {
    request(request: RpcRequest, signal?: AbortSignal): Promise<RemoteResult<RpcResponse>>;
}
/** Wire replies, named so the components do not repeat the shapes. */
export interface RestoreOutcome {
    trashId: string;
    restored: boolean;
}
export interface PurgeOutcome {
    trashId: string;
    purged: boolean;
}
/**
 * One request path for every action. The Host returns bilingual messages as
 * `中文 / English`; this class keeps the half matching the active locale.
 */
export declare class Api {
    private readonly namespace;
    language: "zh" | "en";
    private disposed;
    private readonly controllers;
    constructor(namespace: RemoteNamespace);
    private pick;
    call<T>(action: string, payload: unknown, signal?: AbortSignal): Promise<T>;
    deleteSessions(sessionIds: string[]): Promise<DeleteResult[]>;
    undo(trashId: string): Promise<{
        restored: boolean;
        sessionId: string;
    }>;
    listTrash(): Promise<TrashEntry[]>;
    restore(trashIds: string[]): Promise<RestoreOutcome[]>;
    purge(trashIds: string[]): Promise<PurgeOutcome[]>;
    search(query: string, includeArchived?: boolean): Promise<SessionRow[]>;
    /** The last workspace delete, or null when none has run since the Host started. */
    workspaceReport(): Promise<WorkspaceDeleteReport | null>;
    dispose(): void;
}
