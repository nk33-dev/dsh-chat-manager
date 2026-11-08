window.__ModuleLoader__.load({
	id: "@dsh-chat-manager/plugin",
	factory: function(require) {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react = require("react");
		react = __toESM(react, 1);
		let zod = require("zod");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_dom = require("react-dom");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/shared/schemas.ts
		const json = zod.z.lazy(() => zod.z.union([
			zod.z.null(),
			zod.z.boolean(),
			zod.z.number().finite(),
			zod.z.string(),
			zod.z.array(json),
			zod.z.record(zod.z.string(), json)
		]));
		const rpcRequestSchema = zod.z.object({
			action: zod.z.string().min(1).max(80),
			payload: json
		}).strict();
		const rpcResponseSchema = zod.z.object({
			ok: zod.z.boolean(),
			data: json,
			error: zod.z.string()
		}).strict();
		zod.z.object({ sessionIds: zod.z.array(zod.z.string().min(1)).min(1).max(200) }).strict();
		zod.z.object({ trashIds: zod.z.array(zod.z.string().min(1)).min(1).max(200) }).strict();
		zod.z.object({ trashId: zod.z.string().min(1) }).strict();
		zod.z.object({
			query: zod.z.string().max(200),
			includeArchived: zod.z.boolean().default(false)
		}).strict();
		const remoteContribution = {
			package: "@dsh-chat-manager/plugin",
			descriptors: [{
				id: "@dsh-chat-manager/plugin#chatmanager/request",
				namespace: "chatmanager",
				service: "chatmanager",
				method: "request",
				invocation: { kind: "direct" },
				parameters: [{
					name: "request",
					wire: "request",
					source: "json",
					codec: {
						mode: "strict",
						typeSymbol: "ChatManagerRequest",
						create: () => rpcRequestSchema
					}
				}],
				cancellation: { parameter: "signal" },
				result: {
					mode: "strict",
					typeSymbol: "ChatManagerResponse",
					create: () => rpcResponseSchema
				}
			}]
		};
		//#endregion
		//#region src/client/api.ts
		/**
		* One request path for every action. The Host returns bilingual messages as
		* `中文 / English`; this class keeps the half matching the active locale.
		*/
		var Api = class {
			namespace;
			language = "zh";
			disposed = false;
			controllers = /* @__PURE__ */ new Set();
			constructor(namespace) {
				this.namespace = namespace;
			}
			pick(text) {
				const parts = text.split(" / ");
				return this.language === "en" ? parts.at(-1) ?? text : parts[0];
			}
			async call(action, payload, signal) {
				if (this.disposed) throw new Error("插件已停用 / Plugin disabled");
				const controller = new AbortController();
				this.controllers.add(controller);
				try {
					const response = await this.namespace.request({
						action,
						payload: JSON.parse(JSON.stringify(payload))
					}, signal === void 0 ? controller.signal : AbortSignal.any([signal, controller.signal]));
					if (!response.ok) throw new Error(this.pick(response.error.message || "宿主连接失败 / Host connection failed"));
					if (!response.value.ok) throw new Error(this.pick(response.value.error));
					return response.value.data;
				} finally {
					this.controllers.delete(controller);
				}
			}
			deleteSessions(sessionIds) {
				return this.call("delete", { sessionIds });
			}
			undo(trashId) {
				return this.call("undo", { trashId });
			}
			listTrash() {
				return this.call("trash.list", {});
			}
			restore(trashIds) {
				return this.call("trash.restore", { trashIds });
			}
			purge(trashIds) {
				return this.call("trash.purge", { trashIds });
			}
			search(query, includeArchived = false) {
				return this.call("sessions.search", {
					query,
					includeArchived
				});
			}
			/** The last workspace delete, or null when none has run since the Host started. */
			workspaceReport() {
				return this.call("workspace.report", {});
			}
			dispose() {
				this.disposed = true;
				for (const controller of this.controllers) controller.abort();
				this.controllers.clear();
			}
		};
		//#endregion
		//#region src/client/ui.tsx
		/**
		* The frame overlay is click-through, so a dialog rendered inside a row would
		* inherit no pointer events. Portalling to `document.body` also keeps it out
		* of the sidebar's scroll container and any transform above it.
		*/
		function Portal(props) {
			return (0, react_dom.createPortal)(props.children, document.body);
		}
		/**
		* Confirmation dialog. The title names the object, the body states the
		* consequence, and the confirm button says the action — so a later reader of
		* the button alone still knows what it does.
		*/
		function Dialog(props) {
			const { title, children, confirmLabel, cancelLabel, danger, busy, onConfirm, onCancel } = props;
			const confirmRef = (0, react.useRef)(null);
			const latest = (0, react.useRef)({ onCancel });
			latest.current.onCancel = onCancel;
			(0, react.useEffect)(() => {
				confirmRef.current?.focus({ preventScroll: true });
				const onKey = (event) => {
					if (event.key === "Escape") {
						event.stopPropagation();
						latest.current.onCancel();
					}
				};
				document.addEventListener("keydown", onKey, true);
				return () => document.removeEventListener("keydown", onKey, true);
			}, []);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Portal, { children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "cm-overlay",
				role: "presentation",
				onMouseDown: (event) => {
					if (event.target === event.currentTarget && !busy) onCancel();
				},
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "cm-dialog",
					role: "dialog",
					"aria-modal": "true",
					"aria-label": title,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: title }),
						children,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "cm-dialog-actions",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "cm-button",
								"data-tone": "ghost",
								onClick: onCancel,
								disabled: busy,
								children: cancelLabel
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								ref: confirmRef,
								type: "button",
								className: "cm-button",
								"data-tone": danger ? "danger" : "primary",
								onClick: onConfirm,
								disabled: busy,
								children: confirmLabel
							})]
						})
					]
				})
			}) });
		}
		/** A list of names inside a confirmation, capped so a long batch stays readable. */
		function DialogList(props) {
			const { items, limit = 6 } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cm-dialog-list",
				children: [items.slice(0, limit).map((item, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "cm-dialog-item",
					title: item,
					children: item
				}, `${item}-${index}`)), items.length > limit ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "cm-dialog-item",
					style: { color: "var(--dsw-alias-label-caption)" },
					children: `+${items.length - limit}`
				}) : null]
			});
		}
		/**
		* A row-level icon button. The row itself opens the session, so the button
		* stops both the pointer and the click; stopping only the click still lets a
		* drag or a middle press reach the row.
		*/
		function RowActionButton(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				type: "button",
				className: "cm-row-action",
				"aria-label": props.label,
				title: props.label,
				onClick: (event) => {
					event.preventDefault();
					event.stopPropagation();
					props.onClick();
				},
				onPointerDown: (event) => event.stopPropagation(),
				onMouseDown: (event) => event.stopPropagation(),
				children: props.children
			});
		}
		/**
		* Trash glyph, taken from the host's own icon set (`dsw-icon-trash-outline-
		* regular`) rather than redrawn. Same artwork as the archive and folder icons
		* beside it, so the size, stroke weight, and optical alignment match for free;
		* a hand-drawn path at the same nominal size reads lighter or heavier than its
		* neighbours.
		*/
		function TrashIcon({ size = 14 }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
				width: size,
				height: size,
				"aria-hidden": "true",
				"data-icon": "dsw-icon-trash-outline-regular",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("use", { href: "#dsw-icon-trash-outline-regular" })
			});
		}
		/** Toast body rendered into `shell.overlay`; the owner unmounts it on done. */
		function ToastHost(props) {
			const { message, actionLabel, onAction, onDone, holdMs = 8e3 } = props;
			(0, react.useEffect)(() => {
				const timer = window.setTimeout(onDone, holdMs);
				return () => window.clearTimeout(timer);
			}, [onDone, holdMs]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cm-toast",
				role: "status",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: message }), actionLabel !== void 0 && onAction !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "cm-toast-action",
					onClick: () => {
						onAction();
						onDone();
					},
					children: actionLabel
				}) : null]
			});
		}
		/** Debounce a value so typing in the search box does not fire a request per key. */
		function useDebounced(value, delay = 180) {
			const [settled, setSettled] = (0, react.useState)(value);
			(0, react.useEffect)(() => {
				const timer = window.setTimeout(() => setSettled(value), delay);
				return () => window.clearTimeout(timer);
			}, [value, delay]);
			return settled;
		}
		//#endregion
		//#region src/client/DeleteAction.tsx
		/** Split Host results into what reached the trash and what did not. */
		function batchOf(results) {
			const trashed = results.filter((result) => result.trashed);
			const failures = results.filter((result) => !result.trashed && result.warning !== "").map((result) => `${result.title}: ${result.warning}`);
			return {
				batch: {
					trashIds: trashed.map((result) => result.trashId),
					sessionIds: trashed.map((result) => result.sessionId),
					titles: trashed.map((result) => result.title)
				},
				failures
			};
		}
		/**
		* Hover button that asks for one Session to be deleted.
		*
		* It only raises the request. The confirmation lives in `shell.overlay`
		* (see `DeleteConfirmer`), because this component sits inside the row's action
		* strip, which the Host hides with `display:none` whenever the row is not
		* hovered. A dialog rendered here was observed to flash and vanish; keeping it
		* out of the row removes that whole class of problem.
		*
		* Deleting archives first, so the button follows the same permission the
		* archive action does; a row the user may not archive shows no button rather
		* than one that fails every time.
		*/
		function DeleteRowAction(props) {
			const { sessionId, displayTitle, t, onAsk } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(RowActionButton, {
				label: t("delete"),
				onClick: () => onAsk({
					sessionId,
					displayTitle
				}),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TrashIcon, {})
			});
		}
		/**
		* A menu row for the shared Session menu, so touch and keyboard users reach it
		* too. Rendered through the host's own `MenuItemButton`: the menu draws its
		* rows with that component, and a hand-rolled button would sit at a different
		* height, font size, and icon indent than its neighbours.
		*/
		function DeleteMenuItem(props) {
			const { sessionId, displayTitle, t, setMenuOpen, onAsk } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.MenuItemButton, {
				danger: true,
				separatorBefore: true,
				icon: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TrashIcon, { size: 14 }),
				onSelect: () => {
					setMenuOpen(false);
					onAsk({
						sessionId,
						displayTitle
					});
				},
				children: t("delete")
			});
		}
		/**
		* The confirmation for a single delete, rendered from `shell.overlay`.
		*
		* Living outside the row is the point: `shell.overlay` is root-scoped and
		* always mounted, so nothing the row does to itself can unmount this.
		*/
		function DeleteConfirmer(props) {
			const { target, t, busy, onConfirm, onCancel } = props;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Dialog, {
				title: t("confirmOne", { title: target.displayTitle.trim() || target.sessionId }),
				confirmLabel: t("deleteAction"),
				cancelLabel: t("cancel"),
				danger: true,
				busy,
				onConfirm,
				onCancel,
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("confirmBodyOne") })
			});
		}
		/** Bulk confirmation shared by the sessions page. */
		function BulkDeleteDialog(props) {
			const { t, rows, busy, onConfirm, onCancel } = props;
			const running = rows.filter((row) => row.running).length;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Dialog, {
				title: t("confirmMany", { count: rows.length }),
				confirmLabel: t("deleteAction"),
				cancelLabel: t("cancel"),
				danger: true,
				busy,
				onConfirm,
				onCancel,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("confirmBodyMany") }),
					running > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "cm-dialog-note",
						children: t("confirmRunning", { count: running })
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(DialogList, { items: rows.map((row) => row.title) })
				]
			});
		}
		//#endregion
		//#region src/client/locales.ts
		/**
		* UI copy for both languages.
		*
		* Rules applied throughout: a confirmation title names the object and asks,
		* the body states the consequence, the button says the action. Counts are
		* whole-sentence templates, never concatenated fragments. Errors say what
		* failed and what to do next; the Host writes its own as `中文 / English` and
		* the browser half picks a half.
		*/
		const zh = {
			delete: "删除会话",
			deleteHint: "移到回收站",
			confirmOne: "删除「{title}」？",
			confirmMany: "删除这 {count} 个会话？",
			confirmBodyOne: "会话会移到回收站，8 秒内可撤销，之后仍能从回收站恢复。",
			confirmBodyMany: "这些会话会移到回收站，之后仍能从回收站恢复。",
			confirmRunning: "其中 {count} 个正在运行，会先被停止。",
			confirmCancelRunning: "正在运行的会话会先被停止。",
			deleteAction: "删除",
			cancel: "取消",
			selectedCount: "已选 {count} 个",
			selectAll: "全选",
			clearSelection: "取消选择",
			deleteSelected: "删除 {count} 个会话",
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
			sessionsTitle: "会话",
			sessionsNote: "勾选后可以一次删除多个。",
			searchPlaceholder: "搜索标题、目录或 ID",
			includeArchived: "包含已归档",
			sessionsEmpty: "没有匹配的会话",
			sessionsEmptyHint: "换个关键词试试，或勾选「包含已归档」。",
			running: "运行中",
			archived: "已归档",
			loading: "加载中…",
			deletedOne: "已删除「{title}」",
			deletedMany: "已删除 {count} 个会话",
			undo: "撤销",
			undoDone: "已恢复",
			undoFailed: "没能恢复，请到回收站重试",
			workspaceDeleted: "已删除工作区「{title}」，{count} 个会话进了回收站。",
			workspaceDeletedEmpty: "已删除工作区「{title}」，里面没有会话。",
			workspaceDeletedPartial: "有 {count} 个会话没删掉，仍在「未分组」下。",
			workspaceDeletedDismiss: "知道了",
			empty: "",
			failedGeneric: "操作没完成，请重试",
			failedPartial: "{done} 个已删除，{failed} 个没删掉",
			notRunning: "会话已经不在运行",
			noFiles: "会话记录已不在磁盘上，只从侧栏移除了"
		};
		const en = {
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
			noFiles: "Its files were already gone; only removed from the sidebar"
		};
		/** Compact byte label for a trash row. */
		function formatBytes(size) {
			if (size <= 0) return "0 B";
			const units = [
				"B",
				"KB",
				"MB",
				"GB"
			];
			let value = size;
			let unit = 0;
			while (value >= 1024 && unit < units.length - 1) {
				value /= 1024;
				unit += 1;
			}
			return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
		}
		/** Short absolute date, matching the host's `2026/11/7 20:41` shape. */
		function formatTime(at) {
			const date = new Date(at);
			const pad = (value) => String(value).padStart(2, "0");
			return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
		}
		//#endregion
		//#region src/client/ChatManagerPage.tsx
		/**
		* The plugin's main panel: the trash and a searchable session list.
		*
		* Both views refetch after every mutation. These are small lists and the Host
		* is the authority on the archive set, so a refetch is cheaper to reason about
		* than a local mirror kept in sync by hand.
		*/
		function ChatManagerPage(props) {
			const { api, t, onDeleted } = props;
			const [view, setView] = (0, react.useState)("trash");
			const [error, setError] = (0, react.useState)("");
			const [busy, setBusy] = (0, react.useState)(false);
			const [entries, setEntries] = (0, react.useState)([]);
			const [trashLoaded, setTrashLoaded] = (0, react.useState)(false);
			const [rows, setRows] = (0, react.useState)([]);
			const [sessionsLoaded, setSessionsLoaded] = (0, react.useState)(false);
			const [query, setQuery] = (0, react.useState)("");
			const [includeArchived, setIncludeArchived] = (0, react.useState)(false);
			const [chosen, setChosen] = (0, react.useState)([]);
			const [confirmRows, setConfirmRows] = (0, react.useState)(void 0);
			const [purgeTargets, setPurgeTargets] = (0, react.useState)(void 0);
			const [report, setReport] = (0, react.useState)(null);
			const settledQuery = useDebounced(query, 180);
			const refreshTrash = (0, react.useCallback)(async () => {
				try {
					setEntries(await api.listTrash());
					setTrashLoaded(true);
					setError("");
				} catch (reason) {
					setError(reason instanceof Error ? reason.message : String(reason));
				}
			}, [api]);
			const refreshSessions = (0, react.useCallback)(async (text, archived) => {
				try {
					setRows(await api.search(text, archived));
				} catch (reason) {
					setError(reason instanceof Error ? reason.message : String(reason));
				} finally {
					setSessionsLoaded(true);
				}
			}, [api]);
			(0, react.useEffect)(() => {
				refreshTrash();
			}, [refreshTrash]);
			(0, react.useEffect)(() => {
				api.workspaceReport().then(setReport).catch(() => setReport(null));
			}, [api]);
			(0, react.useEffect)(() => {
				refreshSessions(settledQuery, includeArchived);
			}, [
				refreshSessions,
				settledQuery,
				includeArchived
			]);
			const deleteChosen = async (targets) => {
				setBusy(true);
				setError("");
				try {
					const outcome = batchOf(await api.deleteSessions(targets.map((row) => row.sessionId)));
					onDeleted(outcome.batch, outcome.failures);
					setChosen([]);
					await Promise.all([refreshTrash(), refreshSessions(settledQuery, includeArchived)]);
				} catch (reason) {
					setError(reason instanceof Error ? reason.message : String(reason));
				} finally {
					setBusy(false);
					setConfirmRows(void 0);
				}
			};
			const restoreEntries = async (targets) => {
				setBusy(true);
				setError("");
				try {
					await api.restore(targets.map((entry) => entry.trashId));
					await Promise.all([refreshTrash(), refreshSessions(settledQuery, includeArchived)]);
				} catch (reason) {
					setError(reason instanceof Error ? reason.message : String(reason));
				} finally {
					setBusy(false);
				}
			};
			const purgeEntries = async (targets) => {
				setBusy(true);
				setError("");
				try {
					await api.purge(targets.map((entry) => entry.trashId));
					await refreshTrash();
				} catch (reason) {
					setError(reason instanceof Error ? reason.message : String(reason));
				} finally {
					setBusy(false);
					setPurgeTargets(void 0);
				}
			};
			const chosenRows = (0, react.useMemo)(() => rows.filter((row) => chosen.includes(row.sessionId)), [rows, chosen]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cm-page",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cm-header",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", { children: view === "trash" ? t("trashTitle") : t("sessionsTitle") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "cm-count",
								children: view === "trash" ? t("trashCount", { count: entries.length }) : t("trashCount", { count: rows.length })
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "cm-spacer" })
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "cm-sub",
						children: view === "trash" ? t("trashNote") : t("sessionsNote")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cm-tabs",
						role: "tablist",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							role: "tab",
							className: "cm-tab",
							"aria-selected": view === "trash",
							onClick: () => setView("trash"),
							children: t("trashTitle")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							role: "tab",
							className: "cm-tab",
							"aria-selected": view === "sessions",
							onClick: () => setView("sessions"),
							children: t("sessionsTitle")
						})]
					}),
					error !== "" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "cm-error",
						children: error
					}) : null,
					report !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cm-report",
						role: "status",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
							className: "cm-report-text",
							children: [report.sessionIds.length === 0 ? t("workspaceDeletedEmpty", { title: report.title }) : t("workspaceDeleted", {
								title: report.title,
								count: report.trashIds.length
							}), report.warnings.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [" ", t("workspaceDeletedPartial", { count: report.warnings.length })] }) : null]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "cm-button",
							"data-tone": "ghost",
							onClick: () => setReport(null),
							children: t("workspaceDeletedDismiss")
						})]
					}) : null,
					view === "trash" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TrashList, {
						t,
						entries,
						loaded: trashLoaded,
						busy,
						onRestore: (targets) => void restoreEntries(targets),
						onPurge: (targets) => setPurgeTargets(targets)
					}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(SessionList, {
						t,
						rows,
						loaded: sessionsLoaded,
						query,
						includeArchived,
						chosen,
						busy,
						onQuery: setQuery,
						onIncludeArchived: setIncludeArchived,
						onToggle: (id) => setChosen((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]),
						onSelectAll: () => setChosen(rows.map((row) => row.sessionId)),
						onClear: () => setChosen([]),
						onAskDelete: (targets) => setConfirmRows(targets),
						chosenRows
					}),
					confirmRows !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(BulkDeleteDialog, {
						t,
						rows: confirmRows,
						busy,
						onConfirm: () => void deleteChosen(confirmRows),
						onCancel: () => {
							if (!busy) setConfirmRows(void 0);
						}
					}) : null,
					purgeTargets !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(Dialog, {
						title: purgeTargets.length === 1 ? t("purgeTitleOne", { title: purgeTargets[0].title }) : t("purgeTitleMany", { count: purgeTargets.length }),
						confirmLabel: t("purge"),
						cancelLabel: t("cancel"),
						danger: true,
						busy,
						onConfirm: () => void purgeEntries(purgeTargets),
						onCancel: () => {
							if (!busy) setPurgeTargets(void 0);
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: purgeTargets.length === 1 ? t("purgeBodyOne") : t("purgeBodyMany") }), purgeTargets.length > 1 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DialogList, { items: purgeTargets.map((entry) => entry.title) }) : null]
					}) : null
				]
			});
		}
		function TrashList(props) {
			const { t, entries, loaded, busy, onRestore, onPurge } = props;
			if (!loaded) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "cm-empty",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "cm-empty-title",
					children: t("loading")
				})
			});
			if (entries.length === 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cm-empty",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "cm-empty-title",
					children: t("trashEmpty")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "cm-empty-hint",
					children: t("trashEmptyHint")
				})]
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "cm-toolbar",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "cm-button",
					disabled: busy,
					onClick: () => onRestore(entries),
					children: t("restoreAll")
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					className: "cm-button",
					"data-tone": "ghost",
					disabled: busy,
					onClick: () => onPurge(entries),
					children: t("purgeAll")
				})]
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "cm-list",
				children: entries.map((entry) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "cm-item",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cm-item-main",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "cm-item-title",
							title: entry.title,
							children: entry.title
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "cm-item-meta",
							children: [
								entry.cwd,
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "cm-dot",
									children: "·"
								}),
								formatBytes(entry.sizeBytes),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "cm-dot",
									children: "·"
								}),
								t("deletedAt", { time: formatTime(entry.deletedAt) })
							]
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cm-item-actions",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "cm-button",
							disabled: busy,
							onClick: () => onRestore([entry]),
							children: t("restore")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "cm-button",
							"data-tone": "ghost",
							disabled: busy,
							onClick: () => onPurge([entry]),
							children: t("purge")
						})]
					})]
				}, entry.trashId))
			})] });
		}
		function SessionList(props) {
			const { t, rows, loaded, query, includeArchived, chosen, chosenRows, busy } = props;
			if (!loaded) return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "cm-empty",
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
					className: "cm-empty-title",
					children: t("loading")
				})
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "cm-toolbar",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
						className: "cm-search",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "search",
							value: query,
							placeholder: t("searchPlaceholder"),
							"aria-label": t("searchPlaceholder"),
							onChange: (event) => props.onQuery(event.target.value)
						})
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "cm-switch",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked: includeArchived,
							onChange: (event) => props.onIncludeArchived(event.target.checked)
						}), t("includeArchived")]
					})]
				}),
				chosen.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "cm-bulk",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("selectedCount", { count: chosen.length }) }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "cm-spacer" }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "cm-button",
							"data-tone": "ghost",
							onClick: props.onClear,
							children: t("clearSelection")
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "cm-button",
							"data-tone": "danger",
							disabled: busy,
							onClick: () => props.onAskDelete(chosenRows),
							children: t("deleteSelected", { count: chosen.length })
						})
					]
				}) : null,
				rows.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "cm-empty",
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "cm-empty-title",
						children: t("sessionsEmpty")
					}), includeArchived ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "cm-empty-hint",
						children: t("sessionsEmptyHint")
					})]
				}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "cm-toolbar",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
						className: "cm-switch",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							checked: chosen.length > 0 && chosen.length === rows.length,
							ref: (node) => {
								if (node !== null) node.indeterminate = chosen.length > 0 && chosen.length < rows.length;
							},
							onChange: () => chosen.length === rows.length ? props.onClear() : props.onSelectAll()
						}), t("selectAll")]
					})
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "cm-list",
					children: rows.map((row) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "cm-item",
						"data-selected": chosen.includes(row.sessionId),
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
							type: "checkbox",
							className: "cm-check",
							checked: chosen.includes(row.sessionId),
							onChange: () => props.onToggle(row.sessionId),
							"aria-label": row.title
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "cm-item-main",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "cm-item-title",
								title: row.title,
								children: row.title
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "cm-item-meta",
								children: [
									row.cwd,
									row.running ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "cm-dot",
										children: "·"
									}), t("running")] }) : null,
									row.archived ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "cm-dot",
										children: "·"
									}), t("archived")] }) : null,
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "cm-dot",
										children: "·"
									}),
									formatTime(row.updatedAt)
								]
							})]
						})]
					}, row.sessionId))
				})] })
			] });
		}
		//#endregion
		//#region src/client/style.ts
		/**
		* Every rule reads Harness's own `--dsw-*` tokens, so the plugin follows the
		* active light or dark theme without shipping a second palette.
		*
		* Token names matter: this build defines `bg-layer-1/2/3` (not `bg-l1/l2`),
		* `state-error-primary` (not `state-danger-primary`), and `--dsw-radius-sm`
		* as 8px. A missing token resolves to an empty value and the rule then paints
		* nothing, so the names here were read off the running app, not guessed.
		*
		* Sizes follow the host's own controls: 24px row icon buttons with a 14px
		* glyph and a 4px corner, 24px small buttons, 13px body text. The exact values
		* were measured off the running app beside the shipped archive button.
		*/
		const css = `
/* Row action: the host's own row icon button is 24x24 with a 14px glyph and a
   4px corner, so the trash matches it exactly rather than reading as a
   differently-sized control beside archive and pin. */
.cm-row-action{display:inline-flex;flex:0 0 auto;align-items:center;justify-content:center;box-sizing:border-box;width:24px;height:24px;padding:0;border:0;border-radius:4px;background:transparent;color:var(--dsw-alias-label-tertiary);line-height:1;cursor:pointer;transition:background-color .12s ease,color .12s ease}
.cm-row-action svg{width:14px;height:14px}
.cm-row-action:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary)}
.cm-row-action:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}

/* Modal: portalled to body, so no sidebar column can clip it. */
.cm-overlay{position:fixed;inset:0;z-index:80;display:flex;align-items:center;justify-content:center;padding:24px;background:var(--dsw-alias-bg-mask-1);animation:cm-fade .14s ease-out}
.cm-dialog{width:min(400px,100%);padding:20px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);box-shadow:0 16px 40px rgb(0 0 0 / 32%),0 2px 8px rgb(0 0 0 / 18%);animation:cm-rise .16s ease-out}
.cm-dialog h2{margin:0 0 8px;font-size:15px;font-weight:600;line-height:1.4;color:var(--dsw-alias-label-primary)}
.cm-dialog p{margin:0;font-size:13px;line-height:1.6;color:var(--dsw-alias-label-secondary)}
.cm-dialog-list{display:flex;flex-direction:column;gap:4px;margin-top:12px;max-height:220px;overflow:auto}
.cm-dialog-item{display:block;padding:7px 10px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-3);font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cm-dialog-note{margin-top:10px;font-size:12px;line-height:1.5;color:var(--dsw-alias-state-warn-primary)}
.cm-dialog-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}

/* Buttons: 24px tall, the host's small-button height, with a 4px corner. */
.cm-button{display:inline-flex;align-items:center;justify-content:center;gap:6px;box-sizing:border-box;height:24px;padding:0 9px;border:1px solid var(--dsw-alias-border-l2);border-radius:4px;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;line-height:18px;white-space:nowrap;cursor:pointer;transition:background-color .12s ease,border-color .12s ease,opacity .12s ease}
.cm-button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-border-l3)}
.cm-button:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
.cm-button[data-tone="primary"]{border-color:transparent;background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-inverted)}
.cm-button[data-tone="primary"]:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover);border-color:transparent}
.cm-button[data-tone="danger"]{border-color:transparent;background:var(--dsw-alias-state-error-primary);color:#fff}
.cm-button[data-tone="danger"]:hover:not(:disabled){background:var(--dsw-alias-state-error-primary);filter:brightness(1.08);border-color:transparent}
.cm-button[data-tone="ghost"]{border-color:transparent;color:var(--dsw-alias-label-secondary)}
.cm-button[data-tone="ghost"]:hover:not(:disabled){color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover)}
.cm-button:disabled{opacity:.4;cursor:default;pointer-events:none}

/* Page shell */
.cm-page{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.5}
.cm-header{display:flex;align-items:center;gap:10px;padding:20px 24px 0}
.cm-header h1{margin:0;font-size:15px;font-weight:600;line-height:1.4}
.cm-count{height:20px;padding:0 7px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:20px}
.cm-spacer{flex:1 1 auto}
.cm-sub{padding:0 24px;margin:6px 0 0;font-size:12px;line-height:1.6;color:var(--dsw-alias-label-tertiary)}

/* Tabs: a small segmented switch, 22px rows inside a 2px track. */
.cm-tabs{display:inline-flex;align-self:flex-start;gap:2px;margin:14px 24px 0;padding:2px;border-radius:6px;background:var(--dsw-alias-bg-layer-1)}
.cm-tab{box-sizing:border-box;height:22px;padding:0 11px;border:0;border-radius:4px;background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12px;cursor:pointer;transition:background-color .12s ease,color .12s ease}
.cm-tab:hover{color:var(--dsw-alias-label-primary)}
.cm-tab[aria-selected="true"]{background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary)}
.cm-tab:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}

.cm-toolbar{display:flex;align-items:center;gap:8px;padding:14px 24px 0;flex-wrap:wrap}
.cm-search{position:relative;flex:1 1 240px;min-width:170px}
.cm-search input{box-sizing:border-box;width:100%;height:24px;padding:0 9px;border:1px solid var(--dsw-alias-border-l2);border-radius:4px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:inherit;font-size:13px;transition:border-color .12s ease}
.cm-search input::placeholder{color:var(--dsw-alias-label-caption)}
.cm-search input:hover{border-color:var(--dsw-alias-border-l3)}
.cm-search input:focus{outline:none;border-color:var(--dsw-alias-state-business-primary)}
.cm-switch{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--dsw-alias-label-secondary);cursor:pointer;user-select:none}
.cm-switch input{width:14px;height:14px;margin:0;accent-color:var(--dsw-alias-state-business-primary);cursor:pointer}

/* Bulk bar: only while something is selected. */
.cm-bulk{display:flex;align-items:center;gap:6px;margin:12px 24px 0;padding:5px 8px 5px 12px;border-radius:6px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);font-size:12px;color:var(--dsw-alias-label-secondary)}
.cm-bulk strong{color:var(--dsw-alias-label-primary);font-weight:600}

.cm-list{flex:1 1 auto;min-height:0;overflow:auto;padding:8px 16px 24px}
.cm-item{display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:6px;transition:background-color .1s ease}
.cm-item:hover{background:var(--dsw-alias-bg-layer-1)}
.cm-item[data-selected="true"]{background:var(--dsw-alias-bg-layer-2)}
.cm-item-main{flex:1 1 auto;min-width:0}
.cm-item-title{font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cm-item-meta{margin-top:1px;font-size:12px;line-height:1.45;color:var(--dsw-alias-label-caption);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cm-dot{margin:0 5px;opacity:.5}
.cm-item-actions{display:flex;gap:4px;flex:0 0 auto;opacity:0;transition:opacity .1s ease}
.cm-item:hover .cm-item-actions,.cm-item:focus-within .cm-item-actions{opacity:1}
.cm-check{width:14px;height:14px;margin:0;flex:0 0 auto;accent-color:var(--dsw-alias-state-business-primary);cursor:pointer}

/* Empty state: what is missing, then what to do. */
.cm-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:56px 24px;text-align:center}
.cm-empty-title{margin:0;font-size:13px;color:var(--dsw-alias-label-secondary)}
.cm-empty-hint{margin:0;font-size:12px;color:var(--dsw-alias-label-caption)}

.cm-error{margin:12px 24px 0;padding:8px 10px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:1.5}

/* Workspace-delete report: one line about what actually happened, plus a way to clear it. */
.cm-report{display:flex;align-items:flex-start;gap:8px;margin:12px 24px 0;padding:8px 8px 8px 12px;border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2)}
.cm-report-text{flex:1 1 auto;margin:0;font-size:12px;line-height:1.55;color:var(--dsw-alias-label-secondary)}

/* Toast: bottom centre above the composer; click-through except the action. */
.cm-toast{position:fixed;left:50%;bottom:32px;z-index:90;display:flex;align-items:center;gap:10px;max-width:min(520px,calc(100vw - 40px));padding:8px 8px 8px 14px;border-radius:var(--dsw-radius-md);background:var(--dsw-alias-bg-layer-3);border:1px solid var(--dsw-alias-border-l2);box-shadow:0 12px 32px rgb(0 0 0 / 28%);color:var(--dsw-alias-label-primary);font-size:13px;transform:translateX(-50%);pointer-events:auto;animation:cm-toast-in .18s ease-out}
.cm-toast span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cm-toast-action{box-sizing:border-box;height:26px;padding:0 10px;border:0;border-radius:6px;background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-state-business-primary);font:inherit;font-size:12px;cursor:pointer;flex:0 0 auto}
.cm-toast-action:hover{background:var(--dsw-alias-interactive-bg-active)}

@keyframes cm-fade{from{opacity:0}to{opacity:1}}
@keyframes cm-rise{from{opacity:0;transform:translateY(6px) scale(.985)}to{opacity:1;transform:none}}
@keyframes cm-toast-in{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}
@media(prefers-reduced-motion:reduce){.cm-overlay,.cm-dialog,.cm-toast{animation:none!important}.cm-row-action,.cm-button,.cm-tab,.cm-item,.cm-item-actions{transition:none!important}}
@media(hover:none){.cm-item-actions{opacity:1}}
`;
		//#endregion
		//#region src/client/index.tsx
		const inject = [
			"slots",
			"locale",
			"remote"
		];
		const PANEL_ID = "chat-manager-trash";
		const NS = "chatmanager";
		/**
		* The Host's own sentence for deleting a workspace promises the sessions
		* survive and land in "Ungrouped". This plugin makes them go to the trash
		* instead, so leaving that sentence up would be a lie told right before an
		* irreversible-ish action.
		*
		* There is no override hook: `contextMenus.register` cannot replace the entry
		* that raises the dialog, and re-registering a locale namespace throws. The
		* dictionary object the loader hangs onto is plain and unfrozen, so this writes
		* the one entry in place — only for the active installation, only the keys it
		* owns, and restored when the plugin unloads.
		*/
		const HOST_WORKSPACE_DELETE_COPY = {
			zh: { "delete.desc": "将把「{name}」和里面的会话一起删除。会话会移到回收站，可以恢复。" },
			en: { "delete.desc": "Deletes “{name}” and the sessions inside it. They move to the trash and can be restored." }
		};
		var ToastStore = class {
			state;
			listeners = /* @__PURE__ */ new Set();
			get current() {
				return this.state;
			}
			publish(state) {
				this.state = state;
				for (const listener of this.listeners) listener(state);
			}
			subscribe = (listener) => {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			};
		};
		/** Overlay occupant: the current toast, or nothing. */
		function ToastSeat(props) {
			const { store, t, onUndo } = props;
			const [state, setState] = react.default.useState(store.current);
			react.default.useEffect(() => store.subscribe(setState), [store]);
			if (state === void 0) return null;
			const undoable = state.trashIds.length > 0;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ToastHost, {
				message: state.message,
				actionLabel: undoable ? t("undo") : void 0,
				onAction: undoable ? () => onUndo(state.trashIds) : void 0,
				onDone: () => store.publish(void 0)
			});
		}
		/**
		* The pending single-delete request, held outside every row.
		*
		* The row's action strip is hidden with `display:none` whenever the row is not
		* hovered, and a dialog rendered inside it was seen to flash and disappear.
		* `shell.overlay` is root-scoped and always mounted, so the confirmation lives
		* here and the rows only raise requests into it.
		*/
		var ConfirmStore = class {
			target;
			busy = false;
			listeners = /* @__PURE__ */ new Set();
			get current() {
				return {
					target: this.target,
					busy: this.busy
				};
			}
			subscribe = (listener) => {
				this.listeners.add(listener);
				return () => {
					this.listeners.delete(listener);
				};
			};
			notify() {
				for (const listener of this.listeners) listener();
			}
			ask(target) {
				this.target = target;
				this.busy = false;
				this.notify();
			}
			setBusy(busy) {
				this.busy = busy;
				this.notify();
			}
			close() {
				if (this.busy) return;
				this.target = void 0;
				this.notify();
			}
		};
		/** Overlay occupant: the pending delete confirmation, or nothing. */
		function ConfirmSeat(props) {
			const { store, t, run } = props;
			const [state, setState] = react.default.useState(store.current);
			react.default.useEffect(() => {
				setState(store.current);
				return store.subscribe(() => setState(store.current));
			}, [store]);
			if (state.target === void 0) return null;
			const target = state.target;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(DeleteConfirmer, {
				target,
				t,
				busy: state.busy,
				onConfirm: () => void run(target),
				onCancel: () => store.close()
			});
		}
		/**
		* Rewrite the Host's workspace-delete sentence in place.
		*
		* `dicts` is the loader's own plain map, not a frozen snapshot, so writing one
		* key changes what the next `translate` call returns. Every key touched is
		* recorded and put back on dispose, so disabling the plugin restores the
		* Host's wording rather than leaving a half-customised dictionary behind.
		*
		* Load order is not ours to choose: this plugin can activate before the
		* workspace bundle has registered its dictionaries, in which case there is
		* nothing to rewrite yet. `apply` therefore calls this on an interval until it
		* lands, and again whenever `register` runs.
		* @returns a disposer that restores the original strings.
		*/
		function rewriteHostWorkspaceCopy(locale) {
			const dicts = locale.dicts;
			if (!(dicts instanceof Map)) return () => false;
			const restored = [];
			for (const locales of dicts.values()) for (const [language, entries] of locales) {
				const replacements = HOST_WORKSPACE_DELETE_COPY[language.slice(0, 2)];
				if (replacements === void 0) continue;
				for (const [key, text] of Object.entries(replacements)) {
					if (!(key in entries)) continue;
					const previous = entries[key];
					if (previous === text) continue;
					entries[key] = text;
					restored.push(() => {
						entries[key] = previous;
					});
				}
			}
			return () => {
				for (const undo of restored) undo();
				return restored.length > 0;
			};
		}
		/**
		* Run `after` each time the Host registers a dictionary, plus once now.
		*
		* The locale service offers no registration event and its `dicts` map is filled
		* lazily: the workspace bundle only registers its dictionaries when the sidebar
		* first mounts, which can be long after this plugin activates. Wrapping
		* `register` catches every later registration without polling, and the wrapper
		* is removed on dispose.
		* @returns a disposer that restores the original `register`.
		*/
		function captureLocaleRegistrations(locale, after) {
			const original = locale.register;
			if (typeof original !== "function") return () => void 0;
			let active = true;
			locale.register = function patched(...args) {
				const disposer = original.apply(locale, args);
				if (active) after();
				return disposer;
			};
			after();
			return () => {
				active = false;
				locale.register = original;
			};
		}
		async function apply(ctx) {
			try {
				const host = ctx;
				ctx.effect(() => host.locale.register(NS, {
					en,
					zh
				}));
				ctx.effect(() => captureLocaleRegistrations(host.locale, () => rewriteHostWorkspaceCopy(host.locale)));
				const unmountRemote = await host.remote.$mount(remoteContribution);
				ctx.effect(() => unmountRemote);
				ctx.inject([
					"remote.chatmanager",
					"remote",
					"slots",
					"locale"
				], (child) => {
					const services = child;
					const api = new Api(services.remote.chatmanager);
					const bound = (key) => services.locale.bind(NS)(key);
					child.effect(() => () => api.dispose());
					child.effect(() => {
						const style = document.createElement("style");
						style.dataset.plugin = "@dsh-chat-manager/plugin";
						style.textContent = css;
						document.head.appendChild(style);
						return () => style.remove();
					});
					const toasts = new ToastStore();
					const confirm = new ConfirmStore();
					const translate = () => services.locale.bind(NS);
					const publish = (batch, failures, t) => {
						if (batch.trashIds.length === 0) {
							toasts.publish({
								message: failures[0] ?? t("failedGeneric"),
								trashIds: []
							});
							return;
						}
						const message = batch.trashIds.length === 1 ? t("deletedOne", { title: batch.titles[0] ?? batch.sessionIds[0] }) : t("deletedMany", { count: batch.trashIds.length });
						toasts.publish({
							message: failures.length === 0 ? message : `${message} · ${failures[0]}`,
							trashIds: batch.trashIds
						});
					};
					const undo = async (trashIds) => {
						for (const trashId of trashIds) await api.undo(trashId).catch(() => void 0);
					};
					const runDelete = async (target) => {
						confirm.setBusy(true);
						try {
							const outcome = batchOf(await api.deleteSessions([target.sessionId]));
							publish(outcome.batch, outcome.failures, translate());
						} catch (error) {
							publish({
								trashIds: [],
								sessionIds: [],
								titles: []
							}, [error instanceof Error ? error.message : String(error)], translate());
						} finally {
							confirm.setBusy(false);
							confirm.close();
						}
					};
					services.slots.inject("shell.overlay", () => services.slots.register({
						name: "shell.overlay",
						id: "chat-manager-confirm",
						locale: NS
					}, ((props) => react.default.createElement(ConfirmSeat, {
						store: confirm,
						t: props.t,
						run: runDelete
					}))));
					services.slots.inject("shell.overlay", () => services.slots.register({
						name: "shell.overlay",
						id: "chat-manager-toast",
						locale: NS
					}, ((props) => react.default.createElement(ToastSeat, {
						store: toasts,
						t: props.t,
						onUndo: undo
					}))));
					services.slots.inject("sidebar.workspaces.session.row.action", () => services.slots.register({
						name: "sidebar.workspaces.session.row.action",
						id: "chat-manager-delete",
						order: 700,
						locale: NS
					}, ((props) => {
						if (!props.useSessionAccess(props.sessionId, "workspace/archiveSession")) return null;
						return react.default.createElement(DeleteRowAction, {
							sessionId: props.sessionId,
							displayTitle: props.displayTitle,
							t: props.t,
							onAsk: (target) => confirm.ask(target)
						});
					})));
					services.slots.inject("sidebar.workspaces.session.menu.item", () => services.slots.register({
						name: "sidebar.workspaces.session.menu.item",
						id: "chat-manager-delete",
						order: 650,
						locale: NS
					}, ((props) => {
						if (!props.useSessionAccess(props.sessionId, "workspace/archiveSession")) return null;
						const [, setMenuOpen] = props.useMenuOpenState();
						return react.default.createElement(DeleteMenuItem, {
							sessionId: props.sessionId,
							displayTitle: props.displayTitle || "",
							t: props.t,
							setMenuOpen,
							onAsk: (target) => confirm.ask(target)
						});
					})));
					services.slots.inject("main", () => services.slots.register({
						name: "main",
						key: PANEL_ID,
						locale: NS
					}, ((props) => react.default.createElement(ChatManagerPage, {
						api,
						t: props.t,
						onDeleted: (batch, failures) => publish(batch, failures, props.t)
					}))));
					services.slots.inject("sidebar.panellist", () => services.slots.register({
						name: "sidebar.panellist",
						id: PANEL_ID,
						order: 20,
						label: () => bound("trashTitle"),
						locale: NS
					}, ((owner) => react.default.createElement("span", { style: {
						display: "inline-flex",
						color: "currentColor",
						opacity: owner.active ? 1 : .85
					} }, react.default.createElement(TrashIcon, { size: owner.size ?? 16 })))));
				});
			} catch (error) {
				console.error("Chat Manager activation failed", error);
				throw error;
			}
		}
		//#endregion
		exports.apply = apply;
		exports.captureLocaleRegistrations = captureLocaleRegistrations;
		exports.inject = inject;
		exports.rewriteHostWorkspaceCopy = rewriteHostWorkspaceCopy;
		return module.exports;
	}
});
