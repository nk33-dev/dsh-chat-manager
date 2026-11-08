import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
import { z } from "zod";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { copyFile, mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
//#region src/host/paths.ts
/**
* Where Harness keeps its profile data. `DSH_HOME` wins because the desktop
* build sets it when the profile lives outside the default location; the
* per-user default is the fallback.
*/
function resolveDshHome(env = process.env) {
	const configured = env.DSH_HOME?.trim();
	if (configured) return configured;
	return join(homedir(), ".dsh");
}
function dshPaths(home) {
	const own = join(home, "chat-manager");
	return {
		home,
		sessions: join(home, "sessions"),
		projcache: join(home, "storages", "session_projcache", "sessions"),
		workspace: join(home, "storages", "workspace.json"),
		own,
		trash: join(own, "trash")
	};
}
/** `<uuid>` on disk vs `session-<uuid>` in workspace records. */
function bareSessionId(sessionId) {
	return sessionId.startsWith("session-") ? sessionId.slice(8) : sessionId;
}
/** Two spellings of the same id: the stored one and the on-disk one. */
function sessionIdVariants(sessionId) {
	const bare = bareSessionId(sessionId);
	return bare === sessionId ? [sessionId] : [sessionId, bare];
}
//#endregion
//#region src/shared/schemas.ts
const json = z.lazy(() => z.union([
	z.null(),
	z.boolean(),
	z.number().finite(),
	z.string(),
	z.array(json),
	z.record(z.string(), json)
]));
const rpcRequestSchema = z.object({
	action: z.string().min(1).max(80),
	payload: json
}).strict();
const rpcResponseSchema = z.object({
	ok: z.boolean(),
	data: json,
	error: z.string()
}).strict();
/** Payload of `delete` and `restore`: one or more session ids. */
const sessionIdsSchema = z.object({ sessionIds: z.array(z.string().min(1)).min(1).max(200) }).strict();
/** Payload of `purge`: trash entry handles. */
const trashIdsSchema = z.object({ trashIds: z.array(z.string().min(1)).min(1).max(200) }).strict();
/** Payload of `undo`: the single entry the toast reports. */
const undoPayloadSchema = z.object({ trashId: z.string().min(1) }).strict();
/** Payload of `sessions.search`: a literal phrase, possibly empty. */
const searchPayloadSchema = z.object({
	query: z.string().max(200),
	includeArchived: z.boolean().default(false)
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
//#region src/host/scan.ts
/** The projection cache's title path, defensively drilled: the shape moves between versions. */
function readTitle(record) {
	if (typeof record !== "object" || record === null) return "";
	const rows = record.rows;
	if (typeof rows !== "object" || rows === null) return "";
	const title = rows.title;
	if (typeof title === "string") return title;
	if (typeof title === "object" && title !== null) {
		const value = title.val;
		if (typeof value === "string") return value;
	}
	return "";
}
function readCwd(record) {
	if (typeof record !== "object" || record === null) return "";
	const identity = record.identity;
	if (typeof identity !== "object" || identity === null) return "";
	const cwd = identity.cwd;
	return typeof cwd === "string" ? cwd : "";
}
async function readProjection(path) {
	try {
		const raw = JSON.parse(await readFile(path, "utf8"));
		const record = typeof raw === "object" && raw !== null && "record" in raw ? raw.record : raw;
		return {
			title: readTitle(record),
			cwd: readCwd(record)
		};
	} catch {
		return {
			title: "",
			cwd: ""
		};
	}
}
async function sizeOfDirectory(directory) {
	let total = 0;
	let entries;
	try {
		entries = await readdir(directory, { withFileTypes: true });
	} catch {
		return 0;
	}
	for (const entry of entries) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) total += await sizeOfDirectory(path);
		else if (entry.isFile()) try {
			total += (await stat(path)).size;
		} catch {}
	}
	return total;
}
/**
* Locate every session on disk without assuming the project-directory naming
* rule. The rule exists (`--D-Project-foo--`), but it is Harness's to change,
* so the walk matches ids instead of rebuilding the pattern.
*/
async function scanStoredSessions(paths) {
	const found = /* @__PURE__ */ new Map();
	const ensure = (name, presentAs) => {
		const existing = found.get(name);
		if (existing !== void 0) return existing;
		const created = {
			sessionId: presentAs,
			bareId: bareSessionId(name),
			sizeBytes: 0,
			title: "",
			cwd: ""
		};
		found.set(name, created);
		return created;
	};
	let projects = [];
	try {
		projects = (await readdir(paths.sessions, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
	} catch {}
	for (const project of projects) {
		const projectPath = join(paths.sessions, project);
		let sessions = [];
		try {
			sessions = (await readdir(projectPath, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
		} catch {
			continue;
		}
		for (const name of sessions) {
			const session = ensure(name, name);
			session.logDirectory = join(projectPath, name);
			session.sizeBytes = await sizeOfDirectory(session.logDirectory);
		}
	}
	let cacheFiles = [];
	try {
		cacheFiles = (await readdir(paths.projcache, { withFileTypes: true })).filter((entry) => entry.isFile() && entry.name.endsWith(".json")).map((entry) => entry.name);
	} catch {}
	for (const file of cacheFiles) {
		const name = file.slice(0, -5);
		const session = ensure(name, name);
		session.projectionFile = join(paths.projcache, file);
		const projection = await readProjection(session.projectionFile);
		session.title = projection.title;
		session.cwd = projection.cwd;
	}
	return found;
}
//#endregion
//#region src/host/trash.ts
async function movePath(from, to) {
	try {
		await rename(from, to);
	} catch (error) {
		const code = error.code;
		if (code !== "EXDEV" && code !== "EPERM" && code !== "EACCES") throw error;
		await mkdir(dirname(to), { recursive: true });
		await copyFile(from, to);
		await rm(from, { force: true });
	}
}
/**
* Move a session's log and cache entry out of Harness's directories into this
* plugin's trash, recording enough to put both back.
* @returns the trash handle and whether the log itself was moved.
*/
async function trashSession(paths, stored, options) {
	const trashId = randomUUID();
	const directory = join(paths.trash, trashId);
	await mkdir(directory, { recursive: true });
	const manifest = {
		version: 1,
		trashId,
		sessionId: options.sessionId,
		bareId: stored.bareId,
		title: options.title?.trim() || stored.title || stored.bareId,
		cwd: stored.cwd,
		deletedAt: Date.now(),
		sizeBytes: stored.sizeBytes,
		original: {
			...stored.logDirectory === void 0 ? {} : { logDirectory: stored.logDirectory },
			...stored.projectionFile === void 0 ? {} : { projectionFile: stored.projectionFile }
		},
		moved: {},
		workspace: options.workspace ?? null,
		...options.workspaceDeleted === void 0 ? {} : { workspaceDeleted: options.workspaceDeleted },
		workspaceSnapshot: false
	};
	if (stored.logDirectory !== void 0) {
		const target = join(directory, "log");
		await movePath(stored.logDirectory, target);
		manifest.moved.log = "log";
	}
	if (stored.projectionFile !== void 0) {
		const target = join(directory, "projection.json");
		await movePath(stored.projectionFile, target);
		manifest.moved.projection = "projection.json";
	}
	await writeManifest(directory, manifest);
	return {
		trashId,
		manifest,
		hasLog: manifest.moved.log !== void 0
	};
}
async function writeManifest(directory, manifest) {
	await writeFile(join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 1)}\n`, "utf8");
}
async function readManifest(directory) {
	try {
		const raw = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
		return raw?.version === 1 ? raw : void 0;
	} catch {
		return;
	}
}
/** Every readable trash entry, newest first. Unreadable directories are skipped, not reported. */
async function listTrash(paths) {
	let names = [];
	try {
		names = (await readdir(paths.trash, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
	} catch {
		return [];
	}
	const entries = [];
	for (const name of names) {
		const manifest = await readManifest(join(paths.trash, name));
		if (manifest === void 0) continue;
		entries.push({
			trashId: manifest.trashId,
			sessionId: manifest.sessionId,
			title: manifest.title,
			cwd: manifest.cwd,
			deletedAt: manifest.deletedAt,
			sizeBytes: manifest.sizeBytes,
			hasLog: manifest.moved.log !== void 0
		});
	}
	return entries.sort((left, right) => right.deletedAt - left.deletedAt);
}
/** Move a session's parts back to where the manifest says they came from. */
async function restoreSession(paths, trashId) {
	const directory = join(paths.trash, trashId);
	const manifest = await readManifest(directory);
	if (manifest === void 0) return void 0;
	const restore = async (relative, destination) => {
		if (relative === void 0 || destination === void 0) return;
		const source = join(directory, relative);
		try {
			await stat(source);
		} catch {
			return;
		}
		await mkdir(dirname(destination), { recursive: true });
		await movePath(source, destination);
	};
	await restore(manifest.moved.log, manifest.original.logDirectory);
	await restore(manifest.moved.projection, manifest.original.projectionFile);
	await rm(directory, {
		recursive: true,
		force: true
	});
	return manifest;
}
/** Delete a trash entry for good. */
async function purgeTrash(paths, trashId) {
	const directory = join(paths.trash, trashId);
	try {
		await stat(directory);
	} catch {
		return false;
	}
	await rm(directory, {
		recursive: true,
		force: true
	});
	return true;
}
//#endregion
//#region src/host/workspace.ts
async function readDocument(paths) {
	try {
		return JSON.parse(await readFile(paths.workspace, "utf8"));
	} catch (error) {
		if (error.code === "ENOENT") return {};
		throw error;
	}
}
/**
* Write through a sibling temp file and rename over the original, so a crash
* mid-write leaves the previous document intact rather than a truncated one.
*/
async function writeDocument(paths, document) {
	await mkdir(dirname(paths.workspace), { recursive: true });
	const temp = join(dirname(paths.workspace), `workspace.json.chat-manager-${process.pid}.tmp`);
	await writeFile(temp, `${JSON.stringify(document, null, 1)}\n`, "utf8");
	await rename(temp, paths.workspace);
}
/**
* Drop a session from its project's list and from the global pin set.
*
* The archive set is deliberately left alone: the Host owns it, and removing
* the id there would unarchive the session the delete just archived — the row
* would come straight back. A restore lifts the archive through the official
* API instead of editing this file.
* @returns the project and position it held, or undefined when it held none.
*/
async function detachFromWorkspace(paths, sessionId) {
	const document = await readDocument(paths);
	const workspaces = document.tables?.workspaces;
	const variants = new Set(sessionIdVariants(sessionId));
	let slot;
	let changed = false;
	if (workspaces !== void 0) for (const [workspaceId, workspace] of Object.entries(workspaces)) {
		const ids = workspace.sessionIds;
		if (!Array.isArray(ids)) continue;
		const index = ids.findIndex((id) => variants.has(id));
		if (index === -1) continue;
		slot = {
			workspaceId,
			index
		};
		workspace.sessionIds = ids.filter((_, at) => at !== index);
		changed = true;
		break;
	}
	const global = document.global;
	if (global !== void 0) {
		const pinned = global.pinnedSessionIds;
		if (Array.isArray(pinned)) {
			const filtered = pinned.filter((id) => !variants.has(id));
			if (filtered.length !== pinned.length) {
				global.pinnedSessionIds = filtered;
				changed = true;
			}
		}
	}
	if (changed) await writeDocument(paths, document);
	return slot;
}
/** Put a session back where `detachFromWorkspace` found it. Missing projects are skipped. */
async function reattachToWorkspace(paths, sessionId, slot) {
	if (slot === void 0) return false;
	const document = await readDocument(paths);
	const workspace = document.tables?.workspaces?.[slot.workspaceId];
	if (workspace === void 0) return false;
	const ids = workspace.sessionIds ?? [];
	if (ids.some((id) => id === sessionId)) return false;
	const at = Math.min(slot.index, ids.length);
	workspace.sessionIds = [
		...ids.slice(0, at),
		sessionId,
		...ids.slice(at)
	];
	await writeDocument(paths, document);
	return true;
}
/** Copy the workspace document beside a trash entry, so a restore has the original. */
async function snapshotWorkspace(paths, destination) {
	try {
		await copyFile(paths.workspace, destination);
	} catch (error) {
		if (error.code === "ENOENT") return;
		throw error;
	}
}
/** Read one workspace record out of the durable document without touching the Host. */
async function readWorkspaceRecord(paths, workspaceId) {
	const workspace = (await readDocument(paths)).tables?.workspaces?.[workspaceId];
	if (workspace === void 0) return void 0;
	const sessionIds = Array.isArray(workspace.sessionIds) ? workspace.sessionIds : [];
	return {
		workspaceId,
		path: typeof workspace.path === "string" ? workspace.path : "",
		title: typeof workspace.title === "string" ? workspace.title : "",
		sessionIds: [...sessionIds]
	};
}
//#endregion
//#region src/index.ts
const name = "chatmanager";
const inject = [
	"workspaceRegistry",
	"sessionController",
	"typert"
];
function failure(error) {
	return (error instanceof Error ? error.message : String(error)) || "操作失败，请重试 / Operation failed; retry";
}
/** Why one session refused to archive, in the wording the browser half shows. */
function archiveRefusal(error) {
	const name = error?.name;
	if (name === "WorkspaceActiveSessionError") return "会话仍在运行，请先停止 / Session is still running; stop it first";
	if (name === "WorkspaceUnknownSessionError") return "会话不存在 / Session not found";
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
var ChatManagerService = class extends TypertRemoteService {
	static inject = ["workspaceRegistry", "sessionController"];
	paths;
	/** Serializes mutations so two rows in one workspace never interleave their workspace writes. */
	chain = Promise.resolve();
	/** What the last workspace delete did, for the panel to report. */
	lastWorkspaceDelete;
	constructor(ctx, home = resolveDshHome()) {
		super(ctx, "chatmanager");
		this.paths = dshPaths(home);
	}
	get registry() {
		return this.ctx.workspaceRegistry;
	}
	/**
	* The Host's own delete, captured once.
	*
	* `deleteWorkspace` has to call the original after it has dealt with the
	* sessions. Going through `this.registry.delete` would re-enter the wrapper
	* this plugin installed and recurse until the stack blows.
	*/
	originalDelete;
	get sessions() {
		return this.ctx.sessionController;
	}
	serialize(work) {
		const next = this.chain.then(work, work);
		this.chain = next.catch(() => void 0);
		return next;
	}
	/** Hand the wrapper the Host's own delete, so its own path never re-enters. */
	useOriginalDelete(original) {
		this.originalDelete = original;
	}
	/**
	* Serve one plugin request. Validation failures and business failures both
	* leave as `ok: false` with a message the browser half shows as-is.
	*/
	async request(request, signal) {
		try {
			if (this.ctx.invocation && this.ctx.invocation.peer.principal.kind !== "owner") throw new Error("此操作需要宿主所有者 / Host owner required");
			const { action, payload } = rpcRequestSchema.parse(request);
			const data = await this.dispatch(action, payload, signal);
			return {
				ok: true,
				data: JSON.parse(JSON.stringify(data ?? null)),
				error: ""
			};
		} catch (error) {
			if (signal.aborted || error?.name === "AbortError") return {
				ok: false,
				data: null,
				error: "请求已取消 / Request cancelled"
			};
			if (error instanceof z.ZodError) return {
				ok: false,
				data: null,
				error: "内容格式不正确 / Invalid data"
			};
			return {
				ok: false,
				data: null,
				error: failure(error)
			};
		}
	}
	async dispatch(action, payload, signal) {
		switch (action) {
			case "delete": return this.deleteSessions(sessionIdsSchema.parse(payload).sessionIds);
			case "undo": return this.undo(undoPayloadSchema.parse(payload).trashId);
			case "trash.list": return this.list();
			case "trash.restore": return this.restore(trashIdsSchema.parse(payload).trashIds);
			case "trash.purge": return this.purge(trashIdsSchema.parse(payload).trashIds);
			case "sessions.search": return this.search(searchPayloadSchema.parse(payload), signal);
			case "workspace.report": return this.lastWorkspaceDelete ?? null;
			default: throw new Error(`未知操作 / Unknown action: ${action}`);
		}
	}
	/**
	* Delete one or more sessions. Each is independent: one refusal must not
	* stop the rest, so the caller gets a per-session result.
	* @param extra - recorded on every trash entry made by this call; a workspace
	* delete passes the registration it is about to remove, so an undo knows what
	* to rebuild.
	*/
	async deleteSessions(sessionIds, extra) {
		return this.serialize(async () => {
			const stored = await scanStoredSessions(this.paths);
			const results = [];
			for (const raw of sessionIds) results.push(await this.deleteOne(raw, stored, extra));
			return results;
		});
	}
	async deleteOne(rawId, stored, extra) {
		const found = sessionIdVariants(rawId).map((variant) => stored.get(variant)).find((entry) => entry !== void 0);
		const title = found?.title || rawId;
		try {
			await this.registry.archiveSession(rawId, { stopActivity: true });
		} catch (error) {
			return {
				trashId: "",
				sessionId: rawId,
				title,
				trashed: false,
				warning: archiveRefusal(error)
			};
		}
		if (found === void 0) return {
			trashId: "",
			sessionId: rawId,
			title,
			trashed: false,
			warning: "找不到会话文件，已从侧栏移除 / No session files found; removed from the sidebar"
		};
		try {
			const slot = await detachFromWorkspace(this.paths, rawId);
			const result = await trashSession(this.paths, found, {
				sessionId: rawId,
				title,
				workspace: slot,
				...extra?.workspaceDeleted === void 0 ? {} : { workspaceDeleted: extra.workspaceDeleted }
			});
			if (slot !== void 0) await snapshotWorkspace(this.paths, `${this.paths.trash}/${result.trashId}/workspace.json`);
			return {
				trashId: result.trashId,
				sessionId: rawId,
				title: result.manifest.title,
				trashed: true,
				warning: ""
			};
		} catch (error) {
			return {
				trashId: "",
				sessionId: rawId,
				title,
				trashed: false,
				warning: failure(error)
			};
		}
	}
	/** Put one trashed session back and lift its archive. */
	async undo(trashId) {
		return this.serialize(async () => {
			const manifest = await restoreSession(this.paths, trashId);
			if (manifest === void 0) return {
				restored: false,
				sessionId: ""
			};
			let unarchived = true;
			try {
				await this.registry.unarchiveSession(manifest.sessionId);
			} catch {
				unarchived = false;
			}
			let slot = manifest.workspace ?? void 0;
			if (manifest.workspaceDeleted !== void 0) {
				const rebuiltId = await this.rebuildWorkspace(manifest.workspaceDeleted);
				if (rebuiltId === void 0) slot = void 0;
				else slot = {
					workspaceId: rebuiltId,
					index: slot?.index ?? 0
				};
			}
			const rejoined = await reattachToWorkspace(this.paths, manifest.sessionId, slot);
			return {
				restored: unarchived || rejoined,
				sessionId: manifest.sessionId
			};
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
	async rebuildWorkspace(removed) {
		try {
			const existing = await this.registry.resolveByPath(removed.path);
			if (existing !== void 0) return String(existing.id);
			const created = await this.registry.create(removed.path, removed.title);
			return String(created.id);
		} catch {
			return;
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
	async deleteWorkspace(workspaceId) {
		const record = await readWorkspaceRecord(this.paths, workspaceId);
		const live = this.registry.get(workspaceId);
		const sessionIds = live === void 0 || live.sessionIds.length === 0 ? record?.sessionIds ?? [] : live.sessionIds.map(String);
		const snapshot = record ?? (live === void 0 ? void 0 : {
			workspaceId,
			path: live.path,
			title: live.title,
			sessionIds
		});
		const results = sessionIds.length === 0 ? [] : await this.deleteSessions(sessionIds, snapshot === void 0 ? {} : { workspaceDeleted: snapshot });
		const removed = await (this.originalDelete ?? this.registry.delete).call(this.registry, workspaceId);
		const trashed = results.filter((result) => result.trashed);
		const warnings = results.filter((result) => !result.trashed && result.warning !== "").map((result) => `${result.title}: ${result.warning}`);
		this.lastWorkspaceDelete = {
			workspaceId,
			title: snapshot?.title ?? workspaceId,
			sessionIds,
			trashIds: trashed.map((result) => result.trashId),
			warnings,
			at: Date.now()
		};
		return {
			removed,
			sessionIds,
			trashed: trashed.map((result) => result.sessionId),
			warnings
		};
	}
	async restore(trashIds) {
		return this.serialize(async () => {
			const results = [];
			for (const trashId of trashIds) {
				const manifest = await restoreSession(this.paths, trashId);
				if (manifest === void 0) {
					results.push({
						trashId,
						restored: false
					});
					continue;
				}
				try {
					await this.registry.unarchiveSession(manifest.sessionId);
				} catch {}
				let slot = manifest.workspace ?? void 0;
				if (manifest.workspaceDeleted !== void 0) {
					const rebuiltId = await this.rebuildWorkspace(manifest.workspaceDeleted);
					slot = rebuiltId === void 0 ? void 0 : {
						workspaceId: rebuiltId,
						index: slot?.index ?? 0
					};
				}
				await reattachToWorkspace(this.paths, manifest.sessionId, slot);
				results.push({
					trashId,
					restored: true
				});
			}
			return results;
		});
	}
	async purge(trashIds) {
		return this.serialize(async () => {
			const results = [];
			for (const trashId of trashIds) results.push({
				trashId,
				purged: await purgeTrash(this.paths, trashId)
			});
			return results;
		});
	}
	list() {
		return listTrash(this.paths);
	}
	/**
	* List sessions from the Host's own catalog, filtered by title, directory,
	* and id. The caller may ask for archived rows too; a plain query leaves
	* them out, since the trash is where they live.
	*/
	async search(payload, signal) {
		const list = await this.sessions.list({}, signal);
		const archived = new Set(this.registry.archivedSessionIds);
		const rows = [];
		for (const item of list.items) {
			const archivedHere = archived.has(item.sessionId);
			if (archivedHere && !payload.includeArchived) continue;
			rows.push({
				sessionId: item.sessionId,
				title: storedTitle(item) || item.sessionId,
				cwd: item.cwd ?? "",
				updatedAt: item.updatedAt,
				archived: archivedHere,
				running: item.running
			});
		}
		const query = payload.query.trim().toLowerCase();
		if (query === "") return rows;
		return rows.filter((row) => row.title.toLowerCase().includes(query) || row.cwd.toLowerCase().includes(query) || row.sessionId.toLowerCase().includes(query));
	}
};
/** The durable title lives in the cached projection block, not a top-level field. */
function storedTitle(item) {
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
function takeOverWorkspaceDelete(ctx, service) {
	const registry = ctx.workspaceRegistry;
	const original = registry.delete;
	if (typeof original !== "function") return () => void 0;
	service.useOriginalDelete(original);
	registry.delete = ((workspaceId) => service.deleteWorkspace(String(workspaceId)).then((outcome) => outcome.removed));
	return () => {
		registry.delete = original;
		service.useOriginalDelete(void 0);
	};
}
function apply(ctx) {
	const service = new ChatManagerService(ctx);
	ctx.typert.register({
		package: remoteContribution.package,
		face: "host",
		schemas: [],
		model: {
			services: [],
			events: [],
			objects: []
		},
		invocations: remoteContribution.descriptors
	});
	ctx.effect(() => takeOverWorkspaceDelete(ctx, service));
	ctx.effect(() => () => {});
}
//#endregion
export { ChatManagerService, apply, inject, name, takeOverWorkspaceDelete };
