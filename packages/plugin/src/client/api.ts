import type { RemoteResult } from "@deepseek-ai/dsh-typert-protocol";
import type {
  DeleteResult,
  Json,
  RpcRequest,
  RpcResponse,
  SessionRow,
  TrashEntry,
  WorkspaceDeleteReport,
} from "../shared/types.ts";

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
export class Api {
  language: "zh" | "en" = "zh";
  private disposed = false;
  private readonly controllers = new Set<AbortController>();

  constructor(private readonly namespace: RemoteNamespace) {}

  private pick(text: string): string {
    const parts = text.split(" / ");
    return this.language === "en" ? (parts.at(-1) ?? text) : parts[0];
  }

  async call<T>(action: string, payload: unknown, signal?: AbortSignal): Promise<T> {
    if (this.disposed) throw new Error("插件已停用 / Plugin disabled");
    const controller = new AbortController();
    this.controllers.add(controller);
    try {
      const response = await this.namespace.request(
        { action, payload: JSON.parse(JSON.stringify(payload)) as Json },
        signal === undefined ? controller.signal : AbortSignal.any([signal, controller.signal]),
      );
      if (!response.ok) {
        throw new Error(this.pick(response.error.message || "宿主连接失败 / Host connection failed"));
      }
      if (!response.value.ok) throw new Error(this.pick(response.value.error));
      return response.value.data as T;
    } finally {
      this.controllers.delete(controller);
    }
  }

  deleteSessions(sessionIds: string[]): Promise<DeleteResult[]> {
    return this.call<DeleteResult[]>("delete", { sessionIds });
  }

  undo(trashId: string): Promise<{ restored: boolean; sessionId: string }> {
    return this.call("undo", { trashId });
  }

  listTrash(): Promise<TrashEntry[]> {
    return this.call<TrashEntry[]>("trash.list", {});
  }

  restore(trashIds: string[]): Promise<RestoreOutcome[]> {
    return this.call<RestoreOutcome[]>("trash.restore", { trashIds });
  }

  purge(trashIds: string[]): Promise<PurgeOutcome[]> {
    return this.call<PurgeOutcome[]>("trash.purge", { trashIds });
  }

  search(query: string, includeArchived = false): Promise<SessionRow[]> {
    return this.call<SessionRow[]>("sessions.search", { query, includeArchived });
  }

  /** The last workspace delete, or null when none has run since the Host started. */
  workspaceReport(): Promise<WorkspaceDeleteReport | null> {
    return this.call<WorkspaceDeleteReport | null>("workspace.report", {});
  }

  dispose(): void {
    this.disposed = true;
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear();
  }
}
