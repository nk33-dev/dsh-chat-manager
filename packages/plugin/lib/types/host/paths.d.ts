/**
 * Where Harness keeps its profile data. `DSH_HOME` wins because the desktop
 * build sets it when the profile lives outside the default location; the
 * per-user default is the fallback.
 */
export declare function resolveDshHome(env?: NodeJS.ProcessEnv): string;
/** Layout of one Harness home, spelled once so no caller rebuilds it by hand. */
export interface DshPaths {
    home: string;
    /** One directory per project, each holding one directory per session. */
    sessions: string;
    /** Persisted projection cache; the session list reads titles from here. */
    projcache: string;
    /** Workspace records, including which sessions belong to which project. */
    workspace: string;
    /** This plugin's own state, kept out of every Harness-owned file. */
    own: string;
    trash: string;
}
export declare function dshPaths(home: string): DshPaths;
/** `<uuid>` on disk vs `session-<uuid>` in workspace records. */
export declare function bareSessionId(sessionId: string): string;
/** Two spellings of the same id: the stored one and the on-disk one. */
export declare function sessionIdVariants(sessionId: string): string[];
/**
 * Compare a stored cwd with a candidate the same way Harness does when it
 * groups sessions: case-insensitive on Windows, tolerant of trailing
 * separators and either slash.
 */
export declare function sameDirectory(left: string, right: string): boolean;
/** Last path segment, used as a readable project label. */
export declare function directoryLabel(path: string): string;
