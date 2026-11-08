import React from "react";
import type { DeleteResult } from "../shared/types.ts";
import type { T } from "./locales.ts";
/** The trash handles a successful delete returned, kept for the undo toast. */
export interface DeletedBatch {
    trashIds: string[];
    sessionIds: string[];
    titles: string[];
}
/** Split Host results into what reached the trash and what did not. */
export declare function batchOf(results: DeleteResult[]): {
    batch: DeletedBatch;
    failures: string[];
};
/** One session the user asked to delete, before the confirmation resolves. */
export interface DeleteTarget {
    sessionId: string;
    displayTitle: string;
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
export declare function DeleteRowAction(props: {
    sessionId: string;
    displayTitle: string;
    t: T;
    onAsk: (target: DeleteTarget) => void;
}): React.JSX.Element;
/**
 * A menu row for the shared Session menu, so touch and keyboard users reach it
 * too. Rendered through the host's own `MenuItemButton`: the menu draws its
 * rows with that component, and a hand-rolled button would sit at a different
 * height, font size, and icon indent than its neighbours.
 */
export declare function DeleteMenuItem(props: {
    sessionId: string;
    displayTitle: string;
    t: T;
    setMenuOpen: (open: boolean) => void;
    onAsk: (target: DeleteTarget) => void;
}): React.JSX.Element;
/**
 * The confirmation for a single delete, rendered from `shell.overlay`.
 *
 * Living outside the row is the point: `shell.overlay` is root-scoped and
 * always mounted, so nothing the row does to itself can unmount this.
 */
export declare function DeleteConfirmer(props: {
    target: DeleteTarget;
    t: T;
    busy: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}): React.JSX.Element;
/** Bulk confirmation shared by the sessions page. */
export declare function BulkDeleteDialog(props: {
    t: T;
    rows: Array<{
        sessionId: string;
        title: string;
        running: boolean;
    }>;
    busy: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}): React.JSX.Element;
