import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * The frame overlay is click-through, so a dialog rendered inside a row would
 * inherit no pointer events. Portalling to `document.body` also keeps it out
 * of the sidebar's scroll container and any transform above it.
 */
function Portal(props: { children: React.ReactNode }) {
  return createPortal(props.children, document.body);
}

/**
 * Confirmation dialog. The title names the object, the body states the
 * consequence, and the confirm button says the action — so a later reader of
 * the button alone still knows what it does.
 */
export function Dialog(props: {
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { title, children, confirmLabel, cancelLabel, danger, busy, onConfirm, onCancel } = props;
  const confirmRef = useRef<HTMLButtonElement>(null);
  // Callbacks arrive as fresh arrows on every render. Reading them through a
  // ref keeps the listeners and the auto-focus bound to mount, instead of
  // rebinding the document listener (and yanking focus back) on each frame.
  const latest = useRef({ onCancel });
  latest.current.onCancel = onCancel;
  useEffect(() => {
    confirmRef.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        latest.current.onCancel();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, []);
  return (
    <Portal>
      <div
        className="cm-overlay"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !busy) onCancel();
        }}
      >
        <div className="cm-dialog" role="dialog" aria-modal="true" aria-label={title}>
          <h2>{title}</h2>
          {children}
          <div className="cm-dialog-actions">
            <button
              type="button"
              className="cm-button"
              data-tone="ghost"
              onClick={onCancel}
              disabled={busy}
            >
              {cancelLabel}
            </button>
            <button
              ref={confirmRef}
              type="button"
              className="cm-button"
              data-tone={danger ? "danger" : "primary"}
              onClick={onConfirm}
              disabled={busy}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

/** A list of names inside a confirmation, capped so a long batch stays readable. */
export function DialogList(props: { items: string[]; limit?: number }) {
  const { items, limit = 6 } = props;
  const shown = items.slice(0, limit);
  return (
    <div className="cm-dialog-list">
      {shown.map((item, index) => (
        <span key={`${item}-${index}`} className="cm-dialog-item" title={item}>
          {item}
        </span>
      ))}
      {items.length > limit ? (
        <span className="cm-dialog-item" style={{ color: "var(--dsw-alias-label-caption)" }}>
          {`+${items.length - limit}`}
        </span>
      ) : null}
    </div>
  );
}

/**
 * A row-level icon button. The row itself opens the session, so the button
 * stops both the pointer and the click; stopping only the click still lets a
 * drag or a middle press reach the row.
 */
export function RowActionButton(props: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="cm-row-action"
      aria-label={props.label}
      title={props.label}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        props.onClick();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      {props.children}
    </button>
  );
}

/**
 * Trash glyph, taken from the host's own icon set (`dsw-icon-trash-outline-
 * regular`) rather than redrawn. Same artwork as the archive and folder icons
 * beside it, so the size, stroke weight, and optical alignment match for free;
 * a hand-drawn path at the same nominal size reads lighter or heavier than its
 * neighbours.
 */
export function TrashIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} aria-hidden="true" data-icon="dsw-icon-trash-outline-regular">
      <use href="#dsw-icon-trash-outline-regular" />
    </svg>
  );
}

/** Toast body rendered into `shell.overlay`; the owner unmounts it on done. */
export function ToastHost(props: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDone: () => void;
  holdMs?: number;
}) {
  const { message, actionLabel, onAction, onDone, holdMs = 8000 } = props;
  useEffect(() => {
    const timer = window.setTimeout(onDone, holdMs);
    return () => window.clearTimeout(timer);
  }, [onDone, holdMs]);
  return (
    <div className="cm-toast" role="status">
      <span>{message}</span>
      {actionLabel !== undefined && onAction !== undefined ? (
        <button
          type="button"
          className="cm-toast-action"
          onClick={() => {
            onAction();
            onDone();
          }}
        >
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

/** Debounce a value so typing in the search box does not fire a request per key. */
export function useDebounced<T>(value: T, delay = 180): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
