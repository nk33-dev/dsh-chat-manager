import type { Context } from "@deepseek-ai/cordis";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import type { RpcRequest, RpcResponse } from "./shared/types.ts";
export type { RpcRequest, RpcResponse, Json } from "./shared/types.ts";
export declare const name = "chatmanager";
export declare const inject: string[];
declare module "@deepseek-ai/cordis" {
    interface Context {
        chatmanager: ChatManagerService;
    }
}
/**
 * Session deletion for the Harness sidebar.
 *
 * The Host has no delete endpoint, so deletion is a two-step the plugin owns:
 * archive through the official registry so every surface drops the row, then
 * move the log and its cache entry into this plugin's trash, where a restore
 * can put them back.
 */
export declare class ChatManagerService extends TypertRemoteService {
    static inject: string[];
    private readonly paths;
    /** Serializes mutations so two rows in one workspace never interleave their workspace writes. */
    private chain;
    /** What the last workspace delete did, for the panel to report. */
    private lastWorkspaceDelete;
    constructor(ctx: Context, home?: string);
    private get registry();
    /**
     * The Host's own delete, captured once.
     *
     * `deleteWorkspace` has to call the original after it has dealt with the
     * sessions. Going through `this.registry.delete` would re-enter the wrapper
     * this plugin installed and recurse until the stack blows.
     */
    private originalDelete;
    private get sessions();
    private serialize;
    /** Hand the wrapper the Host's own delete, so its own path never re-enters. */
    useOriginalDelete(original: ((workspaceId: never) => Promise<boolean>) | undefined): void;
    /**
     * Serve one plugin request. Validation failures and business failures both
     * leave as `ok: false` with a message the browser half shows as-is.
     */
    request(request: RpcRequest, signal: AbortSignal): Promise<RpcResponse>;
    private dispatch;
    /**
     * Delete one or more sessions. Each is independent: one refusal must not
     * stop the rest, so the caller gets a per-session result.
     * @param extra - recorded on every trash entry made by this call; a workspace
     * delete passes the registration it is about to remove, so an undo knows what
     * to rebuild.
     */
    private deleteSessions;
    private deleteOne;
    /** Put one trashed session back and lift its archive. */
    private undo;
    /**
     * Recreate a workspace registration that a delete removed.
     *
     * `create` resolves the path through `realpath` and refuses one that is gone,
     * so a user who deleted the directory in the meantime keeps the sessions but
     * not the grouping. That is the honest degradation: the sessions are the
     * irreplaceable part.
     * @returns the id of the restored registration, or undefined when it could
     * not be recreated.
     */
    private rebuildWorkspace;
    /**
     * Serve a workspace delete the way this plugin wants it: the sessions move to
     * the trash first, then the registration is removed.
     *
     * The Host's own `delete` keeps every session and drops the grouping, which
     * leaves the sessions loose in "Ungrouped". The user asked for the opposite:
     * deleting a workspace is a delete of what it holds. Sessions that refuse to
     * archive (still running, stops not taking) stay put and fall through to the
     * Host's own behaviour, which is the sane degradation rather than a hard stop.
     * @returns whether a registration was actually removed, matching the shape
     * the workspace controller expects from `registry.delete`.
     */
    deleteWorkspace(workspaceId: string): Promise<{
        removed: boolean;
        sessionIds: string[];
        trashed: string[];
        warnings: string[];
    }>;
    private restore;
    private purge;
    private list;
    /**
     * List sessions from the Host's own catalog, filtered by title, directory,
     * and id. The caller may ask for archived rows too; a plain query leaves
     * them out, since the trash is where they live.
     */
    private search;
}
/**
 * Route the official workspace delete through this plugin.
 *
 * A slot or a menu entry cannot do this: `contextMenus.register` keys on
 * `target/id` and throws on a duplicate, and Cordis refuses to re-provide an
 * already registered service name. Wrapping the registry method works because
 * the workspace controller reads `ctx.workspaceRegistry.delete` at call time
 * rather than capturing it in its constructor.
 *
 * The Host owns `ctx.effect` teardown, so unloading the plugin restores the
 * original method instead of leaving an override behind.
 * @returns a disposer that puts the Host's own method back.
 */
export declare function takeOverWorkspaceDelete(ctx: Context, service: ChatManagerService): () => void;
export declare function apply(ctx: Context): void;
