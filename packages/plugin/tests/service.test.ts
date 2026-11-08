import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Context } from "@deepseek-ai/cordis";
import { ChatManagerService, takeOverWorkspaceDelete } from "../src/index.ts";

/**
 * A real Cordis root Context carrying only the services the plugin calls. The
 * archive set behaves like the real registry: an archived id is remembered and
 * `unarchiveSession` removes it, which is exactly what an undo depends on.
 *
 * The workspace half is backed by the same `workspace.json` the plugin writes,
 * not an in-memory map: the plugin edits that file directly, so a map-based
 * fake would hide whether the two halves actually agree.
 */
function fakeContext(home: string, overrides: { failArchive?: Error } = {}) {
  const archived = new Set<string>();
  const file = join(home, "storages", "workspace.json");

  type Doc = {
    global?: Record<string, unknown>;
    tables?: { workspaces?: Record<string, { path?: string; title?: string; sessionIds?: string[] }> };
  };
  const read = async (): Promise<Doc> => {
    try {
      return JSON.parse(await readFile(file, "utf8")) as Doc;
    } catch {
      return {};
    }
  };
  const write = async (doc: Doc): Promise<void> => {
    await mkdir(join(home, "storages"), { recursive: true });
    await writeFile(file, JSON.stringify(doc));
  };

  const registry = {
    async archiveSession(sessionId: string, options?: { stopActivity?: boolean }) {
      if (overrides.failArchive) throw overrides.failArchive;
      void options;
      archived.add(sessionId);
    },
    async unarchiveSession(sessionId: string) {
      archived.delete(sessionId);
    },
    get archivedSessionIds() {
      return [...archived];
    },
    async delete(workspaceId: string) {
      const doc = await read();
      const workspaces = doc.tables?.workspaces;
      if (workspaces?.[workspaceId] === undefined) return false;
      delete workspaces[workspaceId];
      doc.global = { ...doc.global, workspaceIds: ((doc.global?.workspaceIds as string[]) ?? []).filter((id) => id !== workspaceId) };
      await write(doc);
      return true;
    },
    get(workspaceId: string) {
      // Synchronous by contract; the tests read it right after an await.
      const doc = syncRead();
      const workspace = doc.tables?.workspaces?.[workspaceId];
      if (workspace === undefined) return undefined;
      return {
        id: workspaceId,
        path: workspace.path ?? "",
        title: workspace.title ?? "",
        sessionIds: workspace.sessionIds ?? [],
      };
    },
    async create(path: string, title?: string) {
      const doc = await read();
      const id = `ws-${Object.keys(doc.tables?.workspaces ?? {}).length + 1}`;
      doc.tables = { ...doc.tables, workspaces: { ...(doc.tables?.workspaces ?? {}), [id]: { path, title: title ?? "", sessionIds: [] } } };
      doc.global = { ...doc.global, workspaceIds: [...((doc.global?.workspaceIds as string[]) ?? []), id] };
      await write(doc);
      return { id, path, title: title ?? "", sessionIds: [] };
    },
    async resolveByPath(path: string) {
      const doc = await read();
      const entry = Object.entries(doc.tables?.workspaces ?? {}).find(([, workspace]) => workspace.path === path);
      return entry === undefined ? undefined : { id: entry[0] };
    },
  };

  function syncRead(): Doc {
    try {
      return JSON.parse(readFileSync(file, "utf8")) as Doc;
    } catch {
      return {};
    }
  }
  const sessions = {
    async list() {
      // The Host face resolves with the list value directly.
      return {
        items: [
          {
            sessionId: "session-aaaaaaaa-0000-4000-8000-000000000001",
            updatedAt: 1,
            running: false,
            blank: false,
            agentAvailable: false,
            projections: { kind: "cached", asOfSeq: 0, values: { title: "第一个会话" } },
            cwd: "D:\\Project\\demo",
          },
          {
            sessionId: "session-bbbbbbbb-0000-4000-8000-000000000002",
            updatedAt: 2,
            running: true,
            blank: false,
            agentAvailable: true,
            projections: { kind: "cached", asOfSeq: 0, values: { title: "second" } },
            cwd: "D:\\Project\\other",
          },
        ],
      };
    },
  };
  const ctx = new Context();
  Object.assign(ctx, { workspaceRegistry: registry, sessionController: sessions });
  return { ctx, archived, registry };
}

async function fixture() {
  const home = await mkdtemp(join(tmpdir(), "chat-manager-svc-"));
  const project = join(home, "sessions", "--D-Project-demo--");
  const sessionA = join(project, "aaaaaaaa-0000-4000-8000-000000000001");
  await mkdir(sessionA, { recursive: true });
  await writeFile(join(sessionA, "session.v3.jsonl.zstd"), "log-a");
  await mkdir(join(home, "storages", "session_projcache", "sessions"), { recursive: true });
  await writeFile(
    join(home, "storages", "session_projcache", "sessions", "aaaaaaaa-0000-4000-8000-000000000001.json"),
    JSON.stringify({ version: 7, record: { identity: { cwd: "D:\\Project\\demo" }, rows: { title: { val: "第一个会话" } } } }),
  );
  await writeFile(
    join(home, "storages", "workspace.json"),
    JSON.stringify({
      global: { workspaceIds: ["ws-1"], archivedSessionIds: [], pinnedSessionIds: [] },
      tables: {
        workspaces: {
          "ws-1": {
            path: "D:\\Project\\demo",
            title: "demo",
            sessionIds: ["session-aaaaaaaa-0000-4000-8000-000000000001"],
          },
        },
      },
    }),
  );
  return { home, sessionA };
}

const signal = new AbortController().signal;

describe("Host 服务", () => {
  it("删除 -> 归档 + 移入回收站 -> 撤销后回到原位", async () => {
    const { home, sessionA } = await fixture();
    try {
      const { ctx, archived } = fakeContext(home);
      const service = new ChatManagerService(ctx as never, home);

      const deleted = await service.request(
        { action: "delete", payload: { sessionIds: ["session-aaaaaaaa-0000-4000-8000-000000000001"] } },
        signal,
      );
      expect(deleted.ok).toBe(true);
      const [result] = deleted.data as Array<{ trashId: string; trashed: boolean; title: string }>;
      expect(result.trashed).toBe(true);
      expect(result.title).toBe("第一个会话");
      expect(archived.has("session-aaaaaaaa-0000-4000-8000-000000000001")).toBe(true);

      // The log left its directory and the workspace forgot the session.
      await expect(readFile(join(sessionA, "session.v3.jsonl.zstd"), "utf8")).rejects.toThrow();
      const workspace = JSON.parse(await readFile(join(home, "storages", "workspace.json"), "utf8"));
      expect(workspace.tables.workspaces["ws-1"].sessionIds).toEqual([]);

      const trashed = await service.request({ action: "trash.list", payload: {} }, signal);
      expect((trashed.data as unknown[]).length).toBe(1);

      const undone = await service.request({ action: "undo", payload: { trashId: result.trashId } }, signal);
      expect(undone.ok).toBe(true);
      expect((undone.data as { restored: boolean }).restored).toBe(true);
      expect(archived.has("session-aaaaaaaa-0000-4000-8000-000000000001")).toBe(false);
      expect(await readFile(join(sessionA, "session.v3.jsonl.zstd"), "utf8")).toBe("log-a");

      const restoredWorkspace = JSON.parse(
        await readFile(join(home, "storages", "workspace.json"), "utf8"),
      );
      expect(restoredWorkspace.tables.workspaces["ws-1"].sessionIds).toEqual([
        "session-aaaaaaaa-0000-4000-8000-000000000001",
      ]);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("归档被拒绝时不动任何文件", async () => {
    const { home, sessionA } = await fixture();
    try {
      const refusal = Object.assign(new Error("busy"), { name: "WorkspaceActiveSessionError" });
      const { ctx } = fakeContext(home, { failArchive: refusal });
      const service = new ChatManagerService(ctx as never, home);

      const response = await service.request(
        { action: "delete", payload: { sessionIds: ["session-aaaaaaaa-0000-4000-8000-000000000001"] } },
        signal,
      );
      expect(response.ok).toBe(true);
      const [result] = response.data as Array<{ trashed: boolean; warning: string }>;
      expect(result.trashed).toBe(false);
      expect(result.warning).toContain("仍在运行");
      expect(await readFile(join(sessionA, "session.v3.jsonl.zstd"), "utf8")).toBe("log-a");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("搜索按标题与目录过滤，默认不含已归档", async () => {
    const { home } = await fixture();
    try {
      const { ctx, archived } = fakeContext(home);
      const service = new ChatManagerService(ctx as never, home);

      const all = await service.request(
        { action: "sessions.search", payload: { query: "", includeArchived: false } },
        signal,
      );
      expect((all.data as unknown[]).length).toBe(2);

      const filtered = await service.request(
        { action: "sessions.search", payload: { query: "other", includeArchived: false } },
        signal,
      );
      const rows = filtered.data as Array<{ sessionId: string; running: boolean }>;
      expect(rows).toHaveLength(1);
      expect(rows[0].running).toBe(true);

      archived.add("session-bbbbbbbb-0000-4000-8000-000000000002");
      const hidden = await service.request(
        { action: "sessions.search", payload: { query: "", includeArchived: false } },
        signal,
      );
      expect((hidden.data as unknown[]).length).toBe(1);
      const shown = await service.request(
        { action: "sessions.search", payload: { query: "", includeArchived: true } },
        signal,
      );
      expect((shown.data as unknown[]).length).toBe(2);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("未知操作返回错误而不是抛异常", async () => {
    const { home } = await fixture();
    try {
      const { ctx } = fakeContext(home);
      const service = new ChatManagerService(ctx as never, home);
      const response = await service.request({ action: "nope", payload: {} }, signal);
      expect(response.ok).toBe(false);
      expect(response.error).toContain("未知操作");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("请求体不合约时返回格式错误", async () => {
    const { home } = await fixture();
    try {
      const { ctx } = fakeContext(home);
      const service = new ChatManagerService(ctx as never, home);
      const response = await service.request(
        { action: "delete", payload: { sessionIds: [] } },
        signal,
      );
      expect(response.ok).toBe(false);
      expect(response.error).toContain("格式");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});

describe("删除工作区", () => {
  const sessionId = "session-aaaaaaaa-0000-4000-8000-000000000001";

  /** Register the fixture's workspace in the durable document, as the Host would. */
  async function withWorkspace(home: string) {
    const file = join(home, "storages", "workspace.json");
    const document = JSON.parse(await readFile(file, "utf8")) as {
      global?: Record<string, unknown>;
      tables: { workspaces: Record<string, unknown> };
    };
    document.tables.workspaces = {
      "ws-1": {
        path: "D:\\Project\\demo",
        title: "demo",
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
        sessionIds: [sessionId],
      },
    };
    document.global = { ...document.global, workspaceIds: ["ws-1"] };
    await writeFile(file, JSON.stringify(document));
    return "ws-1";
  }

  it("会话进回收站，工作区注册被移除", async () => {
    const { home, sessionA } = await fixture();
    try {
      const { ctx, archived } = fakeContext(home);
      const id = await withWorkspace(home);
      const service = new ChatManagerService(ctx as never, home);

      const outcome = await service.deleteWorkspace(id);

      expect(outcome.removed).toBe(true);
      expect(outcome.trashed).toEqual([sessionId]);
      expect(outcome.warnings).toEqual([]);
      expect(archived.has(sessionId)).toBe(true);
      // The log moved out of its directory into the trash.
      await expect(readFile(join(sessionA, "session.v3.jsonl.zstd"), "utf8")).rejects.toThrow();
      const entries = await service.request({ action: "trash.list", payload: {} }, signal);
      expect((entries.data as unknown[]).length).toBe(1);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("撤销把会话放回去，并重建被删的工作区", async () => {
    const { home, sessionA } = await fixture();
    try {
      const { ctx, archived } = fakeContext(home);
      const id = await withWorkspace(home);
      const service = new ChatManagerService(ctx as never, home);

      await service.deleteWorkspace(id);
      const listed = await service.request({ action: "trash.list", payload: {} }, signal);
      const [entry] = listed.data as Array<{ trashId: string }>;

      const undone = await service.request({ action: "undo", payload: { trashId: entry.trashId } }, signal);
      expect(undone.ok).toBe(true);
      expect(archived.has(sessionId)).toBe(false);
      expect(await readFile(join(sessionA, "session.v3.jsonl.zstd"), "utf8")).toBe("log-a");

      // The registration came back, and the session rejoined it.
      const registry = (ctx as unknown as { workspaceRegistry: { resolveByPath(p: string): Promise<{ id: string } | undefined>; get(id: string): { sessionIds: string[] } | undefined } })
        .workspaceRegistry;
      const rebuilt = await registry.resolveByPath("D:\\Project\\demo");
      expect(rebuilt).toBeDefined();
      expect(registry.get(rebuilt!.id)?.sessionIds).toEqual([sessionId]);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("会话归档被拒时仍删工作区，并报告没删掉的那个", async () => {
    const { home } = await fixture();
    try {
      const refusal = Object.assign(new Error("busy"), { name: "WorkspaceActiveSessionError" });
      const { ctx } = fakeContext(home, { failArchive: refusal });
      const id = await withWorkspace(home);
      const service = new ChatManagerService(ctx as never, home);

      const outcome = await service.deleteWorkspace(id);

      // The registration still goes: the session ends up ungrouped, which is
      // the Host's own behaviour and the sanest degradation.
      expect(outcome.removed).toBe(true);
      expect(outcome.trashed).toEqual([]);
      expect(outcome.warnings[0]).toContain("仍在运行");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("未知工作区返回 removed:false 且不动任何会话", async () => {
    const { home, sessionA } = await fixture();
    try {
      const { ctx, archived } = fakeContext(home);
      const service = new ChatManagerService(ctx as never, home);

      const outcome = await service.deleteWorkspace("ws-does-not-exist");

      expect(outcome.removed).toBe(false);
      expect(outcome.sessionIds).toEqual([]);
      expect(archived.size).toBe(0);
      expect(await readFile(join(sessionA, "session.v3.jsonl.zstd"), "utf8")).toBe("log-a");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});

describe("接管官方 delete", () => {
  const sessionId = "session-aaaaaaaa-0000-4000-8000-000000000001";

  it("替换注册表的 delete，让官方调用走插件的删除流程", async () => {
    const { home, sessionA } = await fixture();
    try {
      const { ctx, archived } = fakeContext(home);
      const service = new ChatManagerService(ctx as never, home);
      const registry = (ctx as unknown as { workspaceRegistry: { delete(id: string): Promise<boolean> } })
        .workspaceRegistry;

      const restore = takeOverWorkspaceDelete(ctx as never, service);
      const deleted = await registry.delete("ws-1");

      expect(deleted).toBe(true);
      // The official call produced the plugin's outcome, not the Host's.
      expect(archived.has(sessionId)).toBe(true);
      await expect(readFile(join(sessionA, "session.v3.jsonl.zstd"), "utf8")).rejects.toThrow();

      restore();
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("卸载后把宿主原本的 delete 装回去", async () => {
    const { home } = await fixture();
    try {
      const { ctx } = fakeContext(home);
      const service = new ChatManagerService(ctx as never, home);
      const registry = (ctx as unknown as { workspaceRegistry: { delete(id: string): Promise<boolean> } })
        .workspaceRegistry;
      const before = registry.delete;

      const restore = takeOverWorkspaceDelete(ctx as never, service);
      expect(registry.delete).not.toBe(before);

      restore();
      expect(registry.delete).toBe(before);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("宿主没有 delete 方法时什么都不做", async () => {
    const { home } = await fixture();
    try {
      const { ctx } = fakeContext(home);
      const registry = (ctx as unknown as { workspaceRegistry: Record<string, unknown> }).workspaceRegistry;
      delete registry.delete;
      const service = new ChatManagerService(ctx as never, home);

      const restore = takeOverWorkspaceDelete(ctx as never, service);
      expect(registry.delete).toBeUndefined();
      expect(() => restore()).not.toThrow();
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
