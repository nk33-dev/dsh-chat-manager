import React from "react";
/**
 * Confirmation dialog. The title names the object, the body states the
 * consequence, and the confirm button says the action — so a later reader of
 * the button alone still knows what it does.
 */
export declare function Dialog(props: {
    title: string;
    children: React.ReactNode;
    confirmLabel: string;
    cancelLabel: string;
    danger?: boolean;
    busy?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}): React.JSX.Element;
/** A list of names inside a confirmation, capped so a long batch stays readable. */
export declare function DialogList(props: {
    items: string[];
    limit?: number;
}): React.JSX.Element;
/**
 * A row-level icon button. The row itself opens the session, so the button
 * stops both the pointer and the click; stopping only the click still lets a
 * drag or a middle press reach the row.
 */
export declare function RowActionButton(props: {
    label: string;
    onClick: () => void;
    children: React.ReactNode;
}): React.JSX.Element;
/**
 * Trash glyph, taken from the host's own icon set (`dsw-icon-trash-outline-
 * regular`) rather than redrawn. Same artwork as the archive and folder icons
 * beside it, so the size, stroke weight, and optical alignment match for free;
 * a hand-drawn path at the same nominal size reads lighter or heavier than its
 * neighbours.
 */
export declare function TrashIcon({ size }: {
    size?: number;
}): React.JSX.Element;
/** Toast body rendered into `shell.overlay`; the owner unmounts it on done. */
export declare function ToastHost(props: {
    message: string;
    actionLabel?: string;
    onAction?: () => void;
    onDone: () => void;
    holdMs?: number;
}): React.JSX.Element;
/** Debounce a value so typing in the search box does not fire a request per key. */
export declare function useDebounced<T>(value: T, delay?: number): T;
