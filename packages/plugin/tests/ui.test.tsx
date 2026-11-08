// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";

// The host's primitives ship CSS modules, which Node cannot import. The one
// component this plugin renders from that library is a menu row, so a plain
// button with the same contract is enough here.
vi.mock("@deepseek-ai/dsh-client-ui-primitives", () => ({
  MenuItemButton: ({
    children,
    danger,
    onSelect,
  }: {
    children: React.ReactNode;
    danger?: boolean;
    onSelect: () => void;
  }) =>
    React.createElement(
      "button",
      { type: "button", role: "menuitem", "data-danger": danger, onClick: onSelect },
      children,
    ),
}));

import { ChatManagerPage } from "../src/client/ChatManagerPage.tsx";
import {
  DeleteConfirmer,
  DeleteMenuItem,
  DeleteRowAction,
  type DeleteTarget,
} from "../src/client/DeleteAction.tsx";
import { makeTranslate } from "../src/client/locales.ts";
import { captureLocaleRegistrations, rewriteHostWorkspaceCopy } from "../src/client/index.tsx";
import { ToastHost } from "../src/client/ui.tsx";
import type { Api } from "../src/client/api.ts";
import type { DeleteResult, SessionRow, TrashEntry } from "../src/shared/types.ts";

afterEach(cleanup);

const t = makeTranslate("zh");

/** A fake Api: every call is scripted, nothing touches the wire. */
function fakeApi(overrides: Partial<Api> = {}): Api {
  return {
    language: "zh",
    call: vi.fn(async () => null),
    deleteSessions: vi.fn(async (ids: string[]): Promise<DeleteResult[]> =>
      ids.map((sessionId) => ({
        trashId: `trash-${sessionId}`,
        sessionId,
        title: `title-${sessionId}`,
        trashed: true,
        warning: "",
      })),
    ),
    undo: vi.fn(async () => ({ restored: true, sessionId: "s" })),
    listTrash: vi.fn(async (): Promise<TrashEntry[]> => []),
    restore: vi.fn(async (ids: string[]) => ids.map((trashId) => ({ trashId, restored: true }))),
    purge: vi.fn(async (ids: string[]) => ids.map((trashId) => ({ trashId, purged: true }))),
    search: vi.fn(async (): Promise<SessionRow[]> => []),
    workspaceReport: vi.fn(async () => null),
    dispose: vi.fn(),
    ...overrides,
  } as unknown as Api;
}

const trashEntry = (id: string, title: string, deletedAt = 1_700_000_000_000): TrashEntry => ({
  trashId: id,
  sessionId: `session-${id}`,
  title,
  cwd: "D:\\Project\\demo",
  deletedAt,
  sizeBytes: 4096,
  hasLog: true,
});

const sessionRow = (id: string, title: string, running = false): SessionRow => ({
  sessionId: id,
  title,
  cwd: "D:\\Project\\demo",
  updatedAt: 1_700_000_000_000,
  archived: false,
  running,
});

describe("行内删除按钮", () => {
  it("点击只上抛删除意图，不自己渲染弹窗", () => {
    const onAsk = vi.fn();
    render(
      <DeleteRowAction sessionId="session-a" displayTitle="会话 A" t={t} onAsk={onAsk} />,
    );
    fireEvent.click(screen.getByLabelText("删除会话"));
    expect(onAsk).toHaveBeenCalledWith({ sessionId: "session-a", displayTitle: "会话 A" });
    // The confirmation is the overlay's job; this component must not own one.
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("确认框", () => {
  const target: DeleteTarget = { sessionId: "session-a", displayTitle: "会话 A" };

  it("标题点出会话名，正文说明后果", () => {
    render(
      <DeleteConfirmer target={target} t={t} busy={false} onConfirm={vi.fn()} onCancel={vi.fn()} />,
    );
    const dialog = screen.getByRole("dialog");
    expect(dialog.querySelector("h2")?.textContent).toBe("删除「会话 A」？");
    expect(within(dialog).getByText(/移到回收站/)).toBeTruthy();
  });

  it("确认与取消各走一次回调", () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <DeleteConfirmer
        target={target}
        t={t}
        busy={false}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByText("取消"));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("忙碌时不响应取消与 Escape", () => {
    const onCancel = vi.fn();
    const { rerender } = render(
      <DeleteConfirmer
        target={target}
        t={t}
        busy={false}
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    );
    // Mounted while idle, then switched to busy: the keydown listener must read
    // the latest handler rather than the one captured at mount.
    rerender(
      <DeleteConfirmer target={target} t={t} busy onConfirm={vi.fn()} onCancel={onCancel} />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("打开时抢占焦点，成功后回调仍是最新那个", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <DeleteConfirmer target={target} t={t} busy={false} onConfirm={vi.fn()} onCancel={first} />,
    );
    expect(document.activeElement?.textContent).toBe("删除");
    rerender(
      <DeleteConfirmer target={target} t={t} busy={false} onConfirm={vi.fn()} onCancel={second} />,
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe("菜单项", () => {
  it("打开时先关闭菜单再上抛意图", () => {
    const setMenuOpen = vi.fn();
    const onAsk = vi.fn();
    render(
      <DeleteMenuItem
        sessionId="session-a"
        displayTitle="A"
        t={t}
        setMenuOpen={setMenuOpen}
        onAsk={onAsk}
      />,
    );
    fireEvent.click(screen.getByRole("menuitem"));
    expect(setMenuOpen).toHaveBeenCalledWith(false);
    expect(onAsk).toHaveBeenCalledWith({ sessionId: "session-a", displayTitle: "A" });
  });
});

describe("回收站页面", () => {
  it("列出条目并提供恢复与彻底删除", async () => {
    const api = fakeApi({
      listTrash: vi.fn(async () => [trashEntry("t1", "旧会话")]),
    });
    render(<ChatManagerPage api={api} t={t} onDeleted={vi.fn()} />);
    await screen.findByText("旧会话");
    expect(screen.getByText("1 个")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "恢复" }));
    await waitFor(() => expect(api.restore).toHaveBeenCalledWith(["t1"]));
  });

  it("空回收站给出空状态", async () => {
    render(<ChatManagerPage api={fakeApi()} t={t} onDeleted={vi.fn()} />);
    await screen.findByText("回收站是空的");
  });

  it("彻底删除先要二次确认", async () => {
    const api = fakeApi({ listTrash: vi.fn(async () => [trashEntry("t1", "旧会话")]) });
    render(<ChatManagerPage api={api} t={t} onDeleted={vi.fn()} />);
    await screen.findByText("旧会话");
    // The row action opens the dialog; the dialog then carries its own button
    // with the same label, so the confirm click is scoped to the dialog.
    fireEvent.click(screen.getByRole("button", { name: "彻底删除" }));
    const purgeDialog = screen.getByRole("dialog");
    expect(purgeDialog.querySelector("h2")?.textContent).toBe("彻底删除「旧会话」？");
    fireEvent.click(within(purgeDialog).getByRole("button", { name: "彻底删除" }));
    await waitFor(() => expect(api.purge).toHaveBeenCalledWith(["t1"]));
  });
});

describe("会话搜索页", () => {
  it("批量删除提示运行中的会话数量", async () => {
    const api = fakeApi({
      search: vi.fn(async () => [sessionRow("s1", "甲", true), sessionRow("s2", "乙")]),
    });
    const onDeleted = vi.fn();
    render(<ChatManagerPage api={api} t={t} onDeleted={onDeleted} />);
    await screen.findByText("回收站是空的");
    fireEvent.click(screen.getByRole("tab", { name: "会话" }));
    await screen.findByText("甲");

    // The first checkbox in the toolbar is the archived filter; rows carry
    // their own title as the accessible name.
    fireEvent.click(screen.getByLabelText("甲"));
    fireEvent.click(screen.getByLabelText("乙"));
    fireEvent.click(screen.getByRole("button", { name: "删除 2 个会话" }));

    expect(screen.getByText("删除这 2 个会话？")).toBeTruthy();
    expect(screen.getByText(/其中 1 个正在运行/)).toBeTruthy();
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "删除" }));
    await waitFor(() => expect(api.deleteSessions).toHaveBeenCalledWith(["s1", "s2"]));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  });

  it("没有匹配项时给出空状态", async () => {
    const api = fakeApi({ search: vi.fn(async () => []) });
    render(<ChatManagerPage api={api} t={t} onDeleted={vi.fn()} />);
    await screen.findByText("回收站是空的");
    fireEvent.click(screen.getByRole("tab", { name: "会话" }));
    await screen.findByText("没有匹配的会话");
  });

  it("计数胶囊在两个标签上都有数字，不留空壳", async () => {
    const api = fakeApi({ search: vi.fn(async () => [sessionRow("s1", "甲")]) });
    render(<ChatManagerPage api={api} t={t} onDeleted={vi.fn()} />);
    await screen.findByText("回收站是空的");
    fireEvent.click(screen.getByRole("tab", { name: "会话" }));
    await screen.findByText("甲");
    expect(screen.getByText("1 个")).toBeTruthy();
  });

  it("响应回来之前显示加载中，而不是空状态", async () => {
    let settle: (rows: SessionRow[]) => void = () => undefined;
    const api = fakeApi({
      search: vi.fn(
        () => new Promise<SessionRow[]>((resolve) => {
          settle = resolve;
        }),
      ),
    });
    render(<ChatManagerPage api={api} t={t} onDeleted={vi.fn()} />);
    await screen.findByText("回收站是空的");
    fireEvent.click(screen.getByRole("tab", { name: "会话" }));
    expect(screen.getByText("加载中…")).toBeTruthy();
    expect(screen.queryByText("没有匹配的会话")).toBeNull();
    settle([]);
    await screen.findByText("没有匹配的会话");
  });

  it("勾了「包含已归档」就不再提示去勾它", async () => {
    const api = fakeApi({ search: vi.fn(async () => []) });
    render(<ChatManagerPage api={api} t={t} onDeleted={vi.fn()} />);
    await screen.findByText("回收站是空的");
    fireEvent.click(screen.getByRole("tab", { name: "会话" }));
    await screen.findByText("没有匹配的会话");
    expect(screen.getByText(/换个关键词试试/)).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "包含已归档" }));
    await waitFor(() => expect(screen.queryByText(/换个关键词试试/)).toBeNull());
  });

  it("工作区删除后给出结果说明，能关掉", async () => {
    const api = fakeApi({
      workspaceReport: vi.fn(async () => ({
        workspaceId: "ws-1",
        title: "demo",
        sessionIds: ["s1", "s2"],
        trashIds: ["t1", "t2"],
        warnings: [],
        at: 1_700_000_000_000,
      })),
    });
    render(<ChatManagerPage api={api} t={t} onDeleted={vi.fn()} />);
    await screen.findByText(/已删除工作区「demo」，2 个会话进了回收站/);
    fireEvent.click(screen.getByRole("button", { name: "知道了" }));
    expect(screen.queryByText(/已删除工作区/)).toBeNull();
  });
});

describe("提示条", () => {
  it("有撤销动作时点击触发回调并关闭", () => {
    const onAction = vi.fn();
    const onDone = vi.fn();
    render(<ToastHost message="已删除" actionLabel="撤销" onAction={onAction} onDone={onDone} />);
    fireEvent.click(screen.getByText("撤销"));
    expect(onAction).toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
  });

  it("没有撤销动作时不渲染按钮", () => {
    render(<ToastHost message="失败" onDone={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("改写宿主的工作区删除文案", () => {
  /** A stand-in for the loader's dictionary map. */
  function fakeLocale(): {
    locale: {
      register: (ns: string, dicts: { en: object; zh: object }) => () => void;
      bind: (ns: string) => ReturnType<typeof makeTranslate>;
      dicts: Map<string, Map<string, Record<string, string>>>;
    };
  } {
    return {
      locale: {
        register: () => () => undefined,
        bind: makeTranslate.bind(null, "zh"),
        dicts: new Map([
          [
            "workspace",
            new Map([
              [
                "zh",
                { "delete.desc": "文件夹与会话记录会保留", "delete.workspace": "删除工作区" },
              ],
              ["en", { "delete.desc": "Folder and session logs stay" }],
            ]),
          ],
        ]),
      },
    };
  }

  it("把承诺保留的那句换成真实后果", () => {
    const { locale } = fakeLocale();
    rewriteHostWorkspaceCopy(locale);
    expect(locale.dicts.get("workspace")!.get("zh")!["delete.desc"]).toContain("一起删除");
    expect(locale.dicts.get("workspace")!.get("en")!["delete.desc"]).toContain("trash");
  });

  it("不碰同命名空间里的其它文案", () => {
    const { locale } = fakeLocale();
    rewriteHostWorkspaceCopy(locale);
    expect(locale.dicts.get("workspace")!.get("zh")!["delete.workspace"]).toBe("删除工作区");
  });

  it("卸载后还原宿主原文", () => {
    const { locale } = fakeLocale();
    const restore = rewriteHostWorkspaceCopy(locale);
    restore();
    expect(locale.dicts.get("workspace")!.get("zh")!["delete.desc"]).toBe("文件夹与会话记录会保留");
    expect(locale.dicts.get("workspace")!.get("en")!["delete.desc"]).toBe("Folder and session logs stay");
  });

  it("字典里没有这个键时不凭空造", () => {
    const { locale } = fakeLocale();
    locale.dicts = new Map([["workspace", new Map([["zh", {}]])]]);
    rewriteHostWorkspaceCopy(locale);
    expect(locale.dicts.get("workspace")!.get("zh")).toEqual({});
  });

  it("没有 dicts 时安全返回", () => {
    const locale = { register: () => () => undefined, bind: makeTranslate.bind(null, "zh") };
    expect(() => rewriteHostWorkspaceCopy(locale as never)()).not.toThrow();
  });
});

describe("等到宿主注册字典再改写", () => {
  function lateLocale() {
    const dicts = new Map<string, Map<string, Record<string, string>>>();
    const locale = {
      dicts,
      register(ns: string, dict: { en: object; zh: object }) {
        const map = new Map<string, Record<string, string>>();
        for (const [language, entries] of Object.entries(dict)) {
          map.set(language, entries as Record<string, string>);
        }
        dicts.set(ns, map);
        return () => undefined;
      },
      bind: makeTranslate.bind(null, "zh"),
    };
    return locale;
  }

  it("宿主晚注册也能改到", () => {
    const locale = lateLocale();
    const after = vi.fn(() => rewriteHostWorkspaceCopy(locale));
    const restore = captureLocaleRegistrations(locale, after);

    // Nothing registered yet: the immediate pass found no key to rewrite.
    expect(dictsOf(locale, "workspace")).toBeUndefined();

    locale.register("workspace", {
      zh: { "delete.desc": "文件夹与会话记录会保留" },
      en: { "delete.desc": "Folder and session logs stay" },
    });

    expect(dictsOf(locale, "workspace")!["delete.desc"]).toContain("一起删除");
    restore();
  });

  it("卸载后还原宿主原文，并不再拦截注册", () => {
    const locale = lateLocale();
    const restore = captureLocaleRegistrations(locale, () => rewriteHostWorkspaceCopy(locale));
    locale.register("workspace", {
      zh: { "delete.desc": "文件夹与会话记录会保留" },
      en: { "delete.desc": "Folder and session logs stay" },
    });
    const original = locale.register;

    restore();
    expect(locale.register).not.toBe(original);

    // A registration after dispose is left alone.
    locale.register("workspace", {
      zh: { "delete.desc": "文件夹与会话记录会保留" },
      en: { "delete.desc": "Folder and session logs stay" },
    });
    expect(dictsOf(locale, "workspace")!["delete.desc"]).toBe("文件夹与会话记录会保留");
  });
});

/** Read one namespace's dictionary out of a fake locale. */
function dictsOf(
  locale: { dicts: Map<string, Map<string, Record<string, string>>> },
  ns: string,
): Record<string, string> | undefined {
  return locale.dicts.get(ns)?.get("zh");
}
