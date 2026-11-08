/**
 * UI copy for both languages.
 *
 * Rules applied throughout: a confirmation title names the object and asks,
 * the body states the consequence, the button says the action. Counts are
 * whole-sentence templates, never concatenated fragments. Errors say what
 * failed and what to do next; the Host writes its own as `中文 / English` and
 * the browser half picks a half.
 */
export declare const zh: {
    readonly delete: "删除会话";
    readonly deleteHint: "移到回收站";
    readonly confirmOne: "删除「{title}」？";
    readonly confirmMany: "删除这 {count} 个会话？";
    readonly confirmBodyOne: "会话会移到回收站，8 秒内可撤销，之后仍能从回收站恢复。";
    readonly confirmBodyMany: "这些会话会移到回收站，之后仍能从回收站恢复。";
    readonly confirmRunning: "其中 {count} 个正在运行，会先被停止。";
    readonly confirmCancelRunning: "正在运行的会话会先被停止。";
    readonly deleteAction: "删除";
    readonly cancel: "取消";
    readonly selectedCount: "已选 {count} 个";
    readonly selectAll: "全选";
    readonly clearSelection: "取消选择";
    readonly deleteSelected: "删除 {count} 个会话";
    readonly trashTitle: "回收站";
    readonly trashNote: "删除的会话先放在这里，恢复后回到原来的项目和位置。";
    readonly trashEmpty: "回收站是空的";
    readonly trashEmptyHint: "删除会话后，它会先出现在这里。";
    readonly trashCount: "{count} 个";
    readonly restore: "恢复";
    readonly restoreAll: "全部恢复";
    readonly purge: "彻底删除";
    readonly purgeAll: "清空回收站";
    readonly purgeTitleOne: "彻底删除「{title}」？";
    readonly purgeTitleMany: "彻底删除这 {count} 个会话？";
    readonly purgeBodyOne: "删除后无法恢复。";
    readonly purgeBodyMany: "这些会话会从磁盘上删除，无法恢复。";
    readonly deletedAt: "删除于 {time}";
    readonly sessionsTitle: "会话";
    readonly sessionsNote: "勾选后可以一次删除多个。";
    readonly searchPlaceholder: "搜索标题、目录或 ID";
    readonly includeArchived: "包含已归档";
    readonly sessionsEmpty: "没有匹配的会话";
    readonly sessionsEmptyHint: "换个关键词试试，或勾选「包含已归档」。";
    readonly running: "运行中";
    readonly archived: "已归档";
    readonly loading: "加载中…";
    readonly deletedOne: "已删除「{title}」";
    readonly deletedMany: "已删除 {count} 个会话";
    readonly undo: "撤销";
    readonly undoDone: "已恢复";
    readonly undoFailed: "没能恢复，请到回收站重试";
    readonly workspaceDeleted: "已删除工作区「{title}」，{count} 个会话进了回收站。";
    readonly workspaceDeletedEmpty: "已删除工作区「{title}」，里面没有会话。";
    readonly workspaceDeletedPartial: "有 {count} 个会话没删掉，仍在「未分组」下。";
    readonly workspaceDeletedDismiss: "知道了";
    readonly empty: "";
    readonly failedGeneric: "操作没完成，请重试";
    readonly failedPartial: "{done} 个已删除，{failed} 个没删掉";
    readonly notRunning: "会话已经不在运行";
    readonly noFiles: "会话记录已不在磁盘上，只从侧栏移除了";
};
export declare const en: {
    readonly delete: "Delete session";
    readonly deleteHint: "Moves to the trash";
    readonly confirmOne: "Delete “{title}”?";
    readonly confirmMany: "Delete these {count} sessions?";
    readonly confirmBodyOne: "It moves to the trash. You can undo for eight seconds, or restore it here later.";
    readonly confirmBodyMany: "They move to the trash. You can restore them here later.";
    readonly confirmRunning: "{count} of them are running and will be stopped first.";
    readonly confirmCancelRunning: "Running sessions will be stopped first.";
    readonly deleteAction: "Delete";
    readonly cancel: "Cancel";
    readonly selectedCount: "{count} selected";
    readonly selectAll: "Select all";
    readonly clearSelection: "Clear";
    readonly deleteSelected: "Delete {count} sessions";
    readonly trashTitle: "Trash";
    readonly trashNote: "Deleted sessions wait here. Restoring puts one back in its project and position.";
    readonly trashEmpty: "The trash is empty";
    readonly trashEmptyHint: "Deleted sessions show up here first.";
    readonly trashCount: "{count}";
    readonly restore: "Restore";
    readonly restoreAll: "Restore all";
    readonly purge: "Delete permanently";
    readonly purgeAll: "Empty trash";
    readonly purgeTitleOne: "Permanently delete “{title}”?";
    readonly purgeTitleMany: "Permanently delete these {count} sessions?";
    readonly purgeBodyOne: "This cannot be undone.";
    readonly purgeBodyMany: "They are removed from disk and cannot be recovered.";
    readonly deletedAt: "Deleted {time}";
    readonly sessionsTitle: "Sessions";
    readonly sessionsNote: "Tick rows to delete several at once.";
    readonly searchPlaceholder: "Search title, directory, or ID";
    readonly includeArchived: "Include archived";
    readonly sessionsEmpty: "No matching sessions";
    readonly sessionsEmptyHint: "Try another search, or include archived sessions.";
    readonly running: "Running";
    readonly archived: "Archived";
    readonly loading: "Loading…";
    readonly deletedOne: "Deleted “{title}”";
    readonly deletedMany: "Deleted {count} sessions";
    readonly undo: "Undo";
    readonly undoDone: "Restored";
    readonly undoFailed: "Could not restore; try the trash page";
    readonly workspaceDeleted: "Deleted “{title}”; {count} sessions went to the trash.";
    readonly workspaceDeletedEmpty: "Deleted “{title}”; it held no sessions.";
    readonly workspaceDeletedPartial: "{count} could not be deleted and stay under Ungrouped.";
    readonly workspaceDeletedDismiss: "Got it";
    readonly empty: "";
    readonly failedGeneric: "That did not go through. Try again.";
    readonly failedPartial: "{done} deleted, {failed} failed";
    readonly notRunning: "The session is no longer running";
    readonly noFiles: "Its files were already gone; only removed from the sidebar";
};
export type LocaleKey = keyof typeof zh;
export type T = (key: LocaleKey, params?: Record<string, string | number>) => string;
/** Build a translate function over one dictionary, falling back to the key. */
export declare function makeTranslate(language: "zh" | "en"): T;
/** Compact byte label for a trash row. */
export declare function formatBytes(size: number): string;
/** Short absolute date, matching the host's `2026/11/7 20:41` shape. */
export declare function formatTime(at: number): string;
