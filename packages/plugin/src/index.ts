import type { Context } from "@deepseek-ai/cordis";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import type { SessionId } from "@deepseek-ai/dsh-session";
import type {} from "@deepseek-ai/dsh-workspace";
import type {} from "@deepseek-ai/dsh-api-session-controller";
import type {} from "@deepseek-ai/dsh-typert-registry";
import type { SessionListRequest, SessionListValue } from "@deepseek-ai/dsh-api-session-controller/types";
import { z } from "zod";
import { dshPaths, resolveDshHome, sessionIdVariants, type DshPaths } from "./host/paths.ts";
import {
  rpcRequestSchema,
  searchPayloadSchema,
  sessionIdsSchema,
  trashIdsSchema,
  undoPayloadSchema,
} from "./shared/schemas.ts";
import { remoteContribution } from "./shared/remote.ts";
import type {
  DeleteResult,
  Json,
  RpcRequest,
  RpcResponse,
  SessionRow,
  TrashEntry,
  WorkspaceDeleteReport,
} from "./shared/types.ts";
import { scanStoredSessions, type StoredSession } from "./host/scan.ts";
import { listTrash, purgeTrash, restoreSession, trashSession } from "./host/trash.ts";
import {
  detachFromWorkspace,
  readWorkspaceRecord,
  reattachToWorkspace,
  snapshotWorkspace,
  type RemovedWorkspace,
} from "./host/workspace.ts";

export type { RpcRequest, RpcResponse, Json } from "./shared/types.ts";

export const name = "chatmanager";

export const inject = ["workspaceRegistry", "sessionController", "typert"];

declare module "@deepseek-ai/cordis" {
  interface Context {
    chatmanager: ChatManagerService;
  }
}

/** The parts of the session controller this plugin calls; the rest stays unused. */
interface SessionControllerFace {
  /** Resolves with the list value directly; transport failures reject. */
  list(request: SessionListRequest, signal: AbortSignal): Promise<SessionListValue>;
}

/** The parts of the workspace registry this plugin calls. */
interface WorkspaceRegistryFace {
  archiveSession(sessionId: SessionId, options?: { stopActivity?: boolean }): Promise<void>;
  unarchiveSession(sessionId: SessionId): Promise<void>;
  get archivedSessionIds(): readonly SessionId[];
  /** Remove one registration; the directory and every session log stay. */
  delete(workspaceId: never): Promise<boolean>;
  /** One registration by id, with its header-validated session list. */
  get(workspaceId: never):
    | { readonly id: string; readonly path: string; readonly title: string; readonly sessionIds: readonly SessionId[] }
    | undefined;
  /** Adopt an existing directory as a registration. */
  create(path: string, title?: string): Promise<{ readonly id: string }>;
  /** Find a registration by directory without creating one. */
  resolveByPath(path: string): Promise<{ readonly id: string } | undefined>;
}

function failure(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message || "操作失败，请重试 / Operation failed; retry";
}

/** Why one session refused to archive, in the wording the browser half shows. */
function archiveRefusal(error: unknown): string {
  const name = (error as Error)?.name;
  if (name === "WorkspaceActiveSessionError") {
    return "会话仍在运行，请先停止 / Session is still running; stop it first";
  }
  if (name === "WorkspaceUnknownSessionError") {
    return "会话不存在 / Session not found";
  }
  return failure(error);
}

/**
 * Session deletion for the Harness sidebar.
 *
 * The Host has no delete endpoint, so deletion is a two-step the plugin owns:
 * archive through the official registry so every surface drops the row, then
 * move the log and its cache entry into this plugin's trash, where a restore
 * can put them back.
 */
export class ChatManagerService extends TypertRemoteService {
  static inject = ["workspaceRegistry", "sessionController"];

  private readonly paths: DshPaths;
  /** Serializes mutations so two rows in one workspace never interleave their workspace writes. */
  private chain: Promise<unknown> = Promise.resolve();
  /** What the last workspace delete did, for the panel to report. */
  private lastWorkspaceDelete: WorkspaceDeleteReport | undefined;

  constructor(ctx: Context, home = resolveDshHome()) {
    super(ctx, "chatmanager");
    this.paths = dshPaths(home);
  }

  private get registry(): WorkspaceRegistryFace {
    return this.ctx.workspaceRegistry as unknown as WorkspaceRegistryFace;
  }

  /**
   * The Host's own delete, captured once.
   *
   * `deleteWorkspace` has to call the original after it has dealt with the
   * sessions. Going through `this.registry.delete` would re-enter the wrapper
   * this plugin installed and recurse until the stack blows.
   */
  private originalDelete: ((workspaceId: never) => Promise<boolean>) | undefined;

  private get sessions(): SessionControllerFace {
    return this.ctx.sessionController as unknown as SessionControllerFace;
  }

  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const next = this.chain.then(work, work);
    this.chain = next.catch(() => undefined);
    return next;
  }

  /** Hand the wrapper the Host's own delete, so its own path never re-enters. */
  useOriginalDelete(original: ((workspaceId: never) => Promise<boolean>) | undefined): void {
    this.originalDelete = original;
  }

  /**
   * Serve one plugin request. Validation failures and business failures both
   * leave as `ok: false` with a message the browser half shows as-is.
   */
  async request(request: RpcRequest, signal: AbortSignal): Promise<RpcResponse> {
    try {
      if (this.ctx.invocation && this.ctx.invocation.peer.principal.kind !== "owner") {
        throw new Error("此操作需要宿主所有者 / Host owner required");
      }
      const { action, payload } = rpcRequestSchema.parse(request);
      const data = await this.dispatch(action, payload, signal);
      return {
        ok: true,
        data: JSON.parse(JSON.stringify(data ?? null)) as Json,
        error: "",
      };
    } catch (error) {
      if (signal.aborted || (error as Error)?.name === "AbortError") {
        return { ok: false, data: null, error: "请求已取消 / Request cancelled" };
      }
      if (error instanceof z.ZodError) {
        return { ok: false, data: null, error: "内容格式不正确 / Invalid data" };
      }
      return { ok: false, data: null, error: failure(error) };
    }
  }

  private async dispatch(action: string, payload: Json, signal: AbortSignal): Promise<unknown> {
    switch (action) {
      case "delete":
        return this.deleteSessions(sessionIdsSchema.parse(payload).sessionIds);
      case "undo":
        return this.undo(undoPayloadSchema.parse(payload).trashId);
      case "trash.list":
        return this.list();
      case "trash.restore":
        return this.restore(trashIdsSchema.parse(payload).trashIds);
      case "trash.purge":
        return this.purge(trashIdsSchema.parse(payload).trashIds);
      case "sessions.search":
        return this.search(searchPayloadSchema.parse(payload), signal);
      case "workspace.report":
        return this.lastWorkspaceDelete ?? null;
      default:
        throw new Error(`未知操作 / Unknown action: ${action}`);
    }
  }

  /**
   * Delete one or more sessions. Each is independent: one refusal must not
   * stop the rest, so the caller gets a per-session result.
   * @param extra - recorded on every trash entry made by this call; a workspace
   * delete passes the registration it is about to remove, so an undo knows what
   * to rebuild.
   */
  private async deleteSessions(
    sessionIds: string[],
    extra?: { workspaceDeleted?: RemovedWorkspace },
  ): Promise<DeleteResult[]> {
    return this.serialize(async () => {
      const stored = await scanStoredSessions(this.paths);
      const results: DeleteResult[] = [];
      for (const raw of sessionIds) results.push(await this.deleteOne(raw, stored, extra));
      return results;
    });
  }

  private async deleteOne(
    rawId: string,
    stored: Map<string, StoredSession>,
    extra?: { workspaceDeleted?: RemovedWorkspace },
  ): Promise<DeleteResult> {
    // Files may sit under either spelling: the id as listed, or the bare uuid.
    const found = sessionIdVariants(rawId)
      .map((variant) => stored.get(variant))
      .find((entry) => entry !== undefined);
    const title = found?.title || rawId;

    try {
      // Archiving first is what makes the row leave every sidebar. It also
      // records the intent durably, so a crash after this point leaves the
      // session hidden rather than half-deleted and visible.
      await this.registry.archiveSession(rawId as SessionId, { stopActivity: true });
    } catch (error) {
      return { trashId: "", sessionId: rawId, title, trashed: false, warning: archiveRefusal(error) };
    }

    if (found === undefined) {
      // The archive is still worth keeping: the archive set is the only thing
      // holding a row off-screen once its files are gone.
      return {
        trashId: "",
        sessionId: rawId,
        title,
        trashed: false,
        warning: "找不到会话文件，已从侧栏移除 / No session files found; removed from the sidebar",
      };
    }

    try {
      const slot = await detachFromWorkspace(this.paths, rawId);
      const result = await trashSession(this.paths, found, {
        sessionId: rawId,
        title,
        workspace: slot,
        ...(extra?.workspaceDeleted === undefined
          ? {}
          : { workspaceDeleted: extra.workspaceDeleted }),
      });
      if (slot !== undefined) {
        await snapshotWorkspace(this.paths, `${this.paths.trash}/${result.trashId}/workspace.json`);
      }
      return {
        trashId: result.trashId,
        sessionId: rawId,
        title: result.manifest.title,
        trashed: true,
        warning: "",
      };
    } catch (error) {
      // The archive already landed; report the file move failure rather than
      // claiming the session is recoverable from the trash.
      return { trashId: "", sessionId: rawId, title, trashed: false, warning: failure(error) };
    }
  }

  /** Put one trashed session back and lift its archive. */
  private async undo(trashId: string): Promise<{ restored: boolean; sessionId: string }> {
    return this.serialize(async () => {
      const manifest = await restoreSession(this.paths, trashId);
      if (manifest === undefined) return { restored: false, sessionId: "" };
      let unarchived = true;
      try {
        await this.registry.unarchiveSession(manifest.sessionId as SessionId);
      } catch {
        // The files are back either way; a failed unarchive leaves the row in
        // the archive view until the user restores it there.
        unarchived = false;
      }
      // A session whose workspace was deleted has no slot left to rejoin until
      // that workspace exists again. The rebuilt registration gets a new id,
      // so the slot has to be retargeted at it before the reattach can land.
      let slot = manifest.workspace ?? undefined;
      if (manifest.workspaceDeleted !== undefined) {
        const rebuiltId = await this.rebuildWorkspace(manifest.workspaceDeleted);
        if (rebuiltId === undefined) {
          // The directory is gone, so nothing can be regrouped. The files are
          // back on disk and the session is unarchived; that part still holds.
          slot = undefined;
        } else {
          slot = { workspaceId: rebuiltId, index: slot?.index ?? 0 };
        }
      }
      const rejoined = await reattachToWorkspace(this.paths, manifest.sessionId, slot);
      return { restored: unarchived || rejoined, sessionId: manifest.sessionId };
    });
  }

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
  private async rebuildWorkspace(removed: RemovedWorkspace): Promise<string | undefined> {
    try {
      const existing = await this.registry.resolveByPath(removed.path);
      // The same path already carries a registration (created again by hand, or
      // never actually removed): reuse it rather than duplicating the grouping.
      if (existing !== undefined) return String(existing.id);
      const created = await this.registry.create(removed.path, removed.title);
      return String(created.id);
    } catch {
      return undefined;
    }
  }

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
  async deleteWorkspace(workspaceId: string): Promise<{
    removed: boolean;
    sessionIds: string[];
    trashed: string[];
    warnings: string[];
  }> {
    const record = await readWorkspaceRecord(this.paths, workspaceId);
    const live = this.registry.get(workspaceId as never);
    // Prefer the live registry (already cwd-filtered); the file is the fallback
    // for a registration the registry does not expose.
    const sessionIds =
      live === undefined || live.sessionIds.length === 0
        ? (record?.sessionIds ?? [])
        : live.sessionIds.map(String);

    const snapshot: RemovedWorkspace | undefined =
      record ??
      (live === undefined
        ? undefined
        : {
            workspaceId,
            path: live.path,
            title: live.title,
            sessionIds,
          });

    const results =
      sessionIds.length === 0
        ? []
        : await this.deleteSessions(sessionIds, snapshot === undefined ? {} : { workspaceDeleted: snapshot });

    // The registration goes regardless: a session that stayed behind becomes
    // ungrouped, exactly as the Host's own delete would have left it. This must
    // be the captured original — `this.registry.delete` is the wrapper.
    const hostDelete = this.originalDelete ?? this.registry.delete;
    const removed = await hostDelete.call(this.registry, workspaceId as never);

    const trashed = results.filter((result) => result.trashed);
    const warnings = results
      .filter((result) => !result.trashed && result.warning !== "")
      .map((result) => `${result.title}: ${result.warning}`);

    this.lastWorkspaceDelete = {
      workspaceId,
      title: snapshot?.title ?? workspaceId,
      sessionIds,
      trashIds: trashed.map((result) => result.trashId),
      warnings,
      at: Date.now(),
    };

    return {
      removed,
      sessionIds,
      trashed: trashed.map((result) => result.sessionId),
      warnings,
    };
  }

  private async restore(trashIds: string[]): Promise<Array<{ trashId: string; restored: boolean }>> {
    return this.serialize(async () => {
      const results: Array<{ trashId: string; restored: boolean }> = [];
      for (const trashId of trashIds) {
        const manifest = await restoreSession(this.paths, trashId);
        if (manifest === undefined) {
          results.push({ trashId, restored: false });
          continue;
        }
        try {
          await this.registry.unarchiveSession(manifest.sessionId as SessionId);
        } catch {
          // Same trade-off as undo: the files matter more than the flag.
        }
        let slot = manifest.workspace ?? undefined;
        if (manifest.workspaceDeleted !== undefined) {
          const rebuiltId = await this.rebuildWorkspace(manifest.workspaceDeleted);
          slot =
            rebuiltId === undefined
              ? undefined
              : { workspaceId: rebuiltId, index: slot?.index ?? 0 };
        }
        await reattachToWorkspace(this.paths, manifest.sessionId, slot);
        results.push({ trashId, restored: true });
      }
      return results;
    });
  }

  private async purge(trashIds: string[]): Promise<Array<{ trashId: string; purged: boolean }>> {
    return this.serialize(async () => {
      const results: Array<{ trashId: string; purged: boolean }> = [];
      for (const trashId of trashIds) {
        results.push({ trashId, purged: await purgeTrash(this.paths, trashId) });
      }
      return results;
    });
  }

  private list(): Promise<TrashEntry[]> {
    return listTrash(this.paths);
  }

  /**
   * List sessions from the Host's own catalog, filtered by title, directory,
   * and id. The caller may ask for archived rows too; a plain query leaves
   * them out, since the trash is where they live.
   */
  private async search(
    payload: { query: string; includeArchived: boolean },
    signal: AbortSignal,
  ): Promise<SessionRow[]> {
    // The Host face resolves with the value itself; only transport failures
    // reject, and those carry their own message.
    const list = await this.sessions.list({}, signal);
    const archived = new Set<string>(this.registry.archivedSessionIds as readonly string[]);
    const rows: SessionRow[] = [];
    for (const item of list.items) {
      const archivedHere = archived.has(item.sessionId);
      if (archivedHere && !payload.includeArchived) continue;
      rows.push({
        sessionId: item.sessionId,
        title: storedTitle(item) || item.sessionId,
        cwd: item.cwd ?? "",
        updatedAt: item.updatedAt,
        archived: archivedHere,
        running: item.running,
      });
    }
    const query = payload.query.trim().toLowerCase();
    if (query === "") return rows;
    return rows.filter(
      (row) =>
        row.title.toLowerCase().includes(query) ||
        row.cwd.toLowerCase().includes(query) ||
        row.sessionId.toLowerCase().includes(query),
    );
  }
}

/** The durable title lives in the cached projection block, not a top-level field. */
function storedTitle(item: { projections?: { values?: Record<string, unknown> } }): string {
  const title = item.projections?.values?.title;
  return typeof title === "string" ? title : "";
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
export function takeOverWorkspaceDelete(ctx: Context, service: ChatManagerService): () => void {
  const registry = ctx.workspaceRegistry as unknown as WorkspaceRegistryFace;
  const original = registry.delete;
  if (typeof original !== "function") return () => undefined;
  // Held by the service too: its own delete has to reach the Host's method, not
  // the wrapper below, or the two call each other forever.
  service.useOriginalDelete(original);
  registry.delete = ((workspaceId: never) =>
    service.deleteWorkspace(String(workspaceId)).then((outcome) => outcome.removed)) as never;
  return () => {
    registry.delete = original;
    service.useOriginalDelete(undefined);
  };
}

export function apply(ctx: Context): void {
  const service = new ChatManagerService(ctx);
  ctx.typert.register({
    package: remoteContribution.package,
    face: "host",
    schemas: [],
    model: { services: [], events: [], objects: [] },
    invocations: remoteContribution.descriptors,
  });

  ctx.effect(() => takeOverWorkspaceDelete(ctx, service));

  ctx.effect(() => () => {
    void service;
  });
}
