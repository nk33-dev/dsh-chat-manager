import { type DshPaths } from "./paths.ts";
/** Facts the plugin needs about one session's on-disk footprint. */
export interface StoredSession {
    /** Id as Harness records it, e.g. `session-<uuid>`; falls back to the bare id. */
    sessionId: string;
    /** Bare id: the project directory name and the projection file name. */
    bareId: string;
    /** Absolute path of the session's own directory, when one exists. */
    logDirectory?: string;
    /** Absolute path of the projection cache entry, when one exists. */
    projectionFile?: string;
    sizeBytes: number;
    /** Durable title read from the projection cache; empty when unavailable. */
    title: string;
    cwd: string;
}
/**
 * Locate every session on disk without assuming the project-directory naming
 * rule. The rule exists (`--D-Project-foo--`), but it is Harness's to change,
 * so the walk matches ids instead of rebuilding the pattern.
 */
export declare function scanStoredSessions(paths: DshPaths): Promise<Map<string, StoredSession>>;
/**
 * One session's footprint, matching either id spelling.
 *
 * Callers hold the id Harness lists (`session-<uuid>`), while the files may sit
 * under that name or under the bare id.
 */
export declare function findStoredSession(paths: DshPaths, sessionId: string): Promise<StoredSession | undefined>;
