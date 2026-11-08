/**
 * UI copy for both languages.
 *
 * Rules applied throughout: a confirmation title names the object and asks,
 * the body states the consequence, the button says the action. Counts are
 * whole-sentence templates, never concatenated fragments. Errors say what
 * failed and what to do next; the Host writes its own as `中文 / English` and
 * the browser half picks a half.
 */
export const zh = {
  // Row action and menu
  delete: "删除会话",
  deleteHint: "移到回收站",
  // Confirmation
  confirmOne: "删除「{title}」？",
  confirmMany: "删除这 {count} 个会话？",
  confirmBodyOne: "会话会移到回收站，8 秒内可撤销，之后仍能从回收站恢复。",
  confirmBodyMany: "这些会话会移到回收站，之后仍能从回收站恢复。",
  confirmRunning: "其中 {count} 个正在运行，会先被停止。",
  confirmCancelRunning: "正在运行的会话会先被停止。",
  deleteAction: "删除",
  cancel: "取消",
  // Bulk
  selectedCount: "已选 {count} 个",
  selectAll: "全选",
  clearSelection: "取消选择",
  deleteSelected: "删除 {count} 个会话",
  // Trash page
  trashTitle: "回收站",
  trashNote: "删除的会话先放在这里，恢复后回到原来的项目和位置。",
  trashEmpty: "回收站是空的",
  trashEmptyHint: "删除会话后，它会先出现在这里。",
  trashCount: "{count} 个",
  restore: "恢复",
  restoreAll: "全部恢复",
  purge: "彻底删除",
  purgeAll: "清空回收站",
  purgeTitleOne: "彻底删除「{title}」？",
  purgeTitleMany: "彻底删除这 {count} 个会话？",
  purgeBodyOne: "删除后无法恢复。",
  purgeBodyMany: "这些会话会从磁盘上删除，无法恢复。",
  deletedAt: "删除于 {time}",
  // Sessions page
  sessionsTitle: "会话",
  sessionsNote: "勾选后可以一次删除多个。",
  searchPlaceholder: "搜索标题、目录或 ID",
  includeArchived: "包含已归档",
  sessionsEmpty: "没有匹配的会话",
  sessionsEmptyHint: "换个关键词试试，或勾选「包含已归档」。",
  running: "运行中",
  archived: "已归档",
  // Status line used in both lists
  loading: "加载中…",
  // Toasts
  deletedOne: "已删除「{title}」",
  deletedMany: "已删除 {count} 个会话",
  undo: "撤销",
  undoDone: "已恢复",
  undoFailed: "没能恢复，请到回收站重试",
  // Workspace delete report
  workspaceDeleted: "已删除工作区「{title}」，{count} 个会话进了回收站。",
  workspaceDeletedEmpty: "已删除工作区「{title}」，里面没有会话。",
  workspaceDeletedPartial: "有 {count} 个会话没删掉，仍在「未分组」下。",
  workspaceDeletedDismiss: "知道了",
  // Errors
  empty: "",
  failedGeneric: "操作没完成，请重试",
  failedPartial: "{done} 个已删除，{failed} 个没删掉",
  notRunning: "会话已经不在运行",
  noFiles: "会话记录已不在磁盘上，只从侧栏移除了",
} as const;

export const en = {
  delete: "Delete session",
  deleteHint: "Moves to the trash",
  confirmOne: "Delete “{title}”?",
  confirmMany: "Delete these {count} sessions?",
  confirmBodyOne: "It moves to the trash. You can undo for eight seconds, or restore it here later.",
  confirmBodyMany: "They move to the trash. You can restore them here later.",
  confirmRunning: "{count} of them are running and will be stopped first.",
  confirmCancelRunning: "Running sessions will be stopped first.",
  deleteAction: "Delete",
  cancel: "Cancel",
  selectedCount: "{count} selected",
  selectAll: "Select all",
  clearSelection: "Clear",
  deleteSelected: "Delete {count} sessions",
  trashTitle: "Trash",
  trashNote: "Deleted sessions wait here. Restoring puts one back in its project and position.",
  trashEmpty: "The trash is empty",
  trashEmptyHint: "Deleted sessions show up here first.",
  trashCount: "{count}",
  restore: "Restore",
  restoreAll: "Restore all",
  purge: "Delete permanently",
  purgeAll: "Empty trash",
  purgeTitleOne: "Permanently delete “{title}”?",
  purgeTitleMany: "Permanently delete these {count} sessions?",
  purgeBodyOne: "This cannot be undone.",
  purgeBodyMany: "They are removed from disk and cannot be recovered.",
  deletedAt: "Deleted {time}",
  sessionsTitle: "Sessions",
  sessionsNote: "Tick rows to delete several at once.",
  searchPlaceholder: "Search title, directory, or ID",
  includeArchived: "Include archived",
  sessionsEmpty: "No matching sessions",
  sessionsEmptyHint: "Try another search, or include archived sessions.",
  running: "Running",
  archived: "Archived",
  loading: "Loading…",
  deletedOne: "Deleted “{title}”",
  deletedMany: "Deleted {count} sessions",
  undo: "Undo",
  undoDone: "Restored",
  undoFailed: "Could not restore; try the trash page",
  workspaceDeleted: "Deleted “{title}”; {count} sessions went to the trash.",
  workspaceDeletedEmpty: "Deleted “{title}”; it held no sessions.",
  workspaceDeletedPartial: "{count} could not be deleted and stay under Ungrouped.",
  workspaceDeletedDismiss: "Got it",
  empty: "",
  failedGeneric: "That did not go through. Try again.",
  failedPartial: "{done} deleted, {failed} failed",
  notRunning: "The session is no longer running",
  noFiles: "Its files were already gone; only removed from the sidebar",
} as const;

export type LocaleKey = keyof typeof zh;

export type T = (key: LocaleKey, params?: Record<string, string | number>) => string;

/** Build a translate function over one dictionary, falling back to the key. */
export function makeTranslate(language: "zh" | "en"): T {
  const dictionary: Record<string, string> = language === "en" ? en : zh;
  return (key, params) => {
    const template = dictionary[key] ?? String(key);
    if (params === undefined) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match,
    );
  };
}

/** Compact byte label for a trash row. */
export function formatBytes(size: number): string {
  if (size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = size;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

/** Short absolute date, matching the host's `2026/11/7 20:41` shape. */
export function formatTime(at: number): string {
  const date = new Date(at);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
