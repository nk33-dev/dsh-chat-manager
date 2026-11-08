import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dshPaths, directoryLabel, sameDirectory, bareSessionId, sessionIdVariants } from "../src/host/paths.ts";
import { scanStoredSessions } from "../src/host/scan.ts";
import { listTrash, purgeTrash, restoreSession, trashSession } from "../src/host/trash.ts";
import {
  detachFromWorkspace,
  reattachToWorkspace,
  snapshotWorkspace,
} from "../src/host/workspace.ts";

/** A Harness home with two projects, two sessions, and a workspace record. */
async function fixture() {
  const home = await mkdtemp(join(tmpdir(), "chat-manager-test-"));
  const paths = dshPaths(home);
  const project = join(paths.sessions, "--D-Project-demo--");
  const sessionA = join(project, "aaaaaaaa-0000-4000-8000-000000000001");
  const sessionB = join(project, "bbbbbbbb-0000-4000-8000-000000000002");
  await mkdir(sessionA, { recursive: true });
  await mkdir(sessionB, { recursive: true });
  await writeFile(join(sessionA, "session.v3.jsonl.zstd"), "log-a");
  await writeFile(join(sessionB, "session.v3.jsonl.zstd"), "log-b");

  await mkdir(paths.projcache, { recursive: true });
  const projection = (title: string, cwd: string) =>
    JSON.stringify({ version: 7, record: { identity: { cwd }, rows: { title: { val: title } } } });
  await writeFile(
    join(paths.projcache, "aaaaaaaa-0000-4000-8000-000000000001.json"),
    projection("第一个会话", "D:\\Project\\demo"),
  );
  await writeFile(
    join(paths.projcache, "bbbbbbbb-0000-4000-8000-000000000002.json"),
    projection("second session", "D:\\Project\\demo"),
  );

  await mkdir(join(home, "storages"), { recursive: true });
  await writeFile(
    paths.workspace,
    JSON.stringify({
      global: {
        workspaceIds: ["ws-1"],
        archivedSessionIds: [],
        pinnedSessionIds: ["session-bbbbbbbb-0000-4000-8000-000000000002"],
      },
      tables: {
        workspaces: {
          "ws-1": {
            path: "D:\\Project\\demo",
            title: "demo",
            sessionIds: [
              "session-aaaaaaaa-0000-4000-8000-000000000001",
              "session-bbbbbbbb-0000-4000-8000-000000000002",
            ],
          },
        },
      },
    }),
  );

  return { home, paths, sessionA, sessionB };
}

describe("路径归一化", () => {
  it("把 session- 前缀剥掉", () => {
    expect(bareSessionId("session-abc")).toBe("abc");
    expect(bareSessionId("abc")).toBe("abc");
    expect(sessionIdVariants("session-abc")).toEqual(["session-abc", "abc"]);
    expect(sessionIdVariants("abc")).toEqual(["abc"]);
  });

  it("比较目录时忽略大小写、斜杠方向和尾部分隔符", () => {
    expect(sameDirectory("D:\\Project\\Demo\\", "d:/project/demo")).toBe(true);
    expect(sameDirectory("D:\\a", "D:\\b")).toBe(false);
  });

  it("取最后一段作为项目名", () => {
    expect(directoryLabel("D:\\Project\\demo\\")).toBe("demo");
    expect(directoryLabel("/home/me/proj")).toBe("proj");
  });
});

describe("磁盘扫描", () => {
  it("按目录匹配会话，不依赖项目目录命名规则", async () => {
    const { home, paths } = await fixture();
    try {
      const found = await scanStoredSessions(paths);
      expect([...found.keys()].sort()).toEqual([
        "aaaaaaaa-0000-4000-8000-000000000001",
        "bbbbbbbb-0000-4000-8000-000000000002",
      ]);
      const first = found.get("aaaaaaaa-0000-4000-8000-000000000001")!;
      expect(first.title).toBe("第一个会话");
      expect(first.cwd).toBe("D:\\Project\\demo");
      expect(first.sizeBytes).toBeGreaterThan(0);
      expect(first.logDirectory).toBeDefined();
      expect(first.projectionFile).toBeDefined();
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("缺少 sessions 目录时返回空表而不是抛错", async () => {
    const home = await mkdtemp(join(tmpdir(), "chat-manager-empty-"));
    try {
      const found = await scanStoredSessions(dshPaths(home));
      expect(found.size).toBe(0);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("目录名带 session- 前缀时同样能对上", async () => {
    const home = await mkdtemp(join(tmpdir(), "chat-manager-prefixed-"));
    try {
      const paths = dshPaths(home);
      const directory = join(paths.sessions, "--D-Project-demo--", "session-cccccccc-0000-4000-8000-000000000003");
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, "session.v4.jsonl.zstd"), "log-c");
      await mkdir(paths.projcache, { recursive: true });
      await writeFile(
        join(paths.projcache, "session-cccccccc-0000-4000-8000-000000000003.json"),
        JSON.stringify({ version: 7, record: { identity: { cwd: "D:\\Project\\demo" }, rows: { title: { val: "prefixed" } } } }),
      );

      const found = await scanStoredSessions(paths);
      const session = found.get("session-cccccccc-0000-4000-8000-000000000003");
      expect(session?.bareId).toBe("cccccccc-0000-4000-8000-000000000003");
      expect(session?.logDirectory).toBe(directory);
      expect(session?.title).toBe("prefixed");
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("两种命名混在同一个安装里都能读到", async () => {
    const { home, paths } = await fixture();
    try {
      const directory = join(paths.sessions, "--D-Project-demo--", "session-dddddddd-0000-4000-8000-000000000004");
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, "session.v4.jsonl.zstd"), "log-d");
      const found = await scanStoredSessions(paths);
      expect([...found.keys()].sort()).toEqual([
        "aaaaaaaa-0000-4000-8000-000000000001",
        "bbbbbbbb-0000-4000-8000-000000000002",
        "session-dddddddd-0000-4000-8000-000000000004",
      ]);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});

describe("回收站", () => {
  it("删除后文件进回收目录，恢复后回到原位", async () => {
    const { home, paths, sessionA } = await fixture();
    try {
      const stored = (await scanStoredSessions(paths)).get("aaaaaaaa-0000-4000-8000-000000000001")!;
      const slot = await detachFromWorkspace(paths, "session-aaaaaaaa-0000-4000-8000-000000000001");
      expect(slot).toEqual({ workspaceId: "ws-1", index: 0 });

      const result = await trashSession(paths, stored, { sessionId: "session-aaaaaaaa-0000-4000-8000-000000000001", workspace: slot });
      expect(result.hasLog).toBe(true);
      await snapshotWorkspace(paths, join(paths.trash, result.trashId, "workspace.json"));

      const entries = await listTrash(paths);
      expect(entries).toHaveLength(1);
      expect(entries[0].title).toBe("第一个会话");
      expect(entries[0].sizeBytes).toBeGreaterThan(0);

      await expect(readFile(join(sessionA, "session.v3.jsonl.zstd"), "utf8")).rejects.toThrow();

      const manifest = await restoreSession(paths, result.trashId);
      expect(manifest?.sessionId).toBe("session-aaaaaaaa-0000-4000-8000-000000000001");
      expect(await readFile(join(sessionA, "session.v3.jsonl.zstd"), "utf8")).toBe("log-a");
      expect(await listTrash(paths)).toHaveLength(0);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("彻底删除后条目消失且文件不回来", async () => {
    const { home, paths, sessionB } = await fixture();
    try {
      const stored = (await scanStoredSessions(paths)).get("bbbbbbbb-0000-4000-8000-000000000002")!;
      const result = await trashSession(paths, stored, { sessionId: "session-bbbbbbbb-0000-4000-8000-000000000002", workspace: undefined });
      expect(await purgeTrash(paths, result.trashId)).toBe(true);
      expect(await listTrash(paths)).toHaveLength(0);
      await expect(readFile(join(sessionB, "session.v3.jsonl.zstd"), "utf8")).rejects.toThrow();
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("未知条目恢复返回空", async () => {
    const { home, paths } = await fixture();
    try {
      expect(await restoreSession(paths, "no-such-entry")).toBeUndefined();
      expect(await purgeTrash(paths, "no-such-entry")).toBe(false);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});

describe("workspace 记账", () => {
  it("移除会话时保留其它会话的顺序，并清掉 pin", async () => {
    const { home, paths } = await fixture();
    try {
      await detachFromWorkspace(paths, "session-bbbbbbbb-0000-4000-8000-000000000002");
      const document = JSON.parse(await readFile(paths.workspace, "utf8"));
      expect(document.tables.workspaces["ws-1"].sessionIds).toEqual([
        "session-aaaaaaaa-0000-4000-8000-000000000001",
      ]);
      expect(document.global.pinnedSessionIds).toEqual([]);
      // Untouched fields survive the rewrite.
      expect(document.global.workspaceIds).toEqual(["ws-1"]);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("不移除归档集合里的 id", async () => {
    // The Host owns the archive set. Clearing the id here would lift the archive
    // the delete just applied, and the row would reappear immediately.
    const { home, paths } = await fixture();
    try {
      const before = JSON.parse(await readFile(paths.workspace, "utf8"));
      before.global.archivedSessionIds = ["session-aaaaaaaa-0000-4000-8000-000000000001"];
      await writeFile(paths.workspace, JSON.stringify(before));

      await detachFromWorkspace(paths, "session-aaaaaaaa-0000-4000-8000-000000000001");
      const after = JSON.parse(await readFile(paths.workspace, "utf8"));
      expect(after.global.archivedSessionIds).toEqual([
        "session-aaaaaaaa-0000-4000-8000-000000000001",
      ]);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("恢复时放回原来的位置", async () => {
    const { home, paths } = await fixture();
    try {
      const slot = await detachFromWorkspace(paths, "session-aaaaaaaa-0000-4000-8000-000000000001");
      expect(slot).toEqual({ workspaceId: "ws-1", index: 0 });
      expect(await reattachToWorkspace(paths, "session-aaaaaaaa-0000-4000-8000-000000000001", slot)).toBe(true);
      const document = JSON.parse(await readFile(paths.workspace, "utf8"));
      expect(document.tables.workspaces["ws-1"].sessionIds).toEqual([
        "session-aaaaaaaa-0000-4000-8000-000000000001",
        "session-bbbbbbbb-0000-4000-8000-000000000002",
      ]);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("项目已不存在时不写回", async () => {
    const { home, paths } = await fixture();
    try {
      const restored = await reattachToWorkspace(paths, "session-x", {
        workspaceId: "gone",
        index: 0,
      });
      expect(restored).toBe(false);
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });

  it("没有 workspace.json 时移除是安全的", async () => {
    const home = await mkdtemp(join(tmpdir(), "chat-manager-nows-"));
    try {
      const paths = dshPaths(home);
      expect(await detachFromWorkspace(paths, "session-x")).toBeUndefined();
    } finally {
      await rm(home, { recursive: true, force: true });
    }
  });
});
