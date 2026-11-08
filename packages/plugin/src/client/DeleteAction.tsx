import React from "react";
import { MenuItemButton } from "@deepseek-ai/dsh-client-ui-primitives";
import type { DeleteResult } from "../shared/types.ts";
import type { Api } from "./api.ts";
import type { T } from "./locales.ts";
import { Dialog, DialogList, RowActionButton, TrashIcon } from "./ui.tsx";

/** The trash handles a successful delete returned, kept for the undo toast. */
export interface DeletedBatch {
  trashIds: string[];
  sessionIds: string[];
  titles: string[];
}

/** Split Host results into what reached the trash and what did not. */
export function batchOf(results: DeleteResult[]): {
  batch: DeletedBatch;
  failures: string[];
} {
  const trashed = results.filter((result) => result.trashed);
  const failures = results
    .filter((result) => !result.trashed && result.warning !== "")
    .map((result) => `${result.title}: ${result.warning}`);
  return {
    batch: {
      trashIds: trashed.map((result) => result.trashId),
      sessionIds: trashed.map((result) => result.sessionId),
      titles: trashed.map((result) => result.title),
    },
    failures,
  };
}

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
export function DeleteRowAction(props: {
  sessionId: string;
  displayTitle: string;
  t: T;
  onAsk: (target: DeleteTarget) => void;
}) {
  const { sessionId, displayTitle, t, onAsk } = props;
  return (
    <RowActionButton label={t("delete")} onClick={() => onAsk({ sessionId, displayTitle })}>
      <TrashIcon />
    </RowActionButton>
  );
}

/**
 * A menu row for the shared Session menu, so touch and keyboard users reach it
 * too. Rendered through the host's own `MenuItemButton`: the menu draws its
 * rows with that component, and a hand-rolled button would sit at a different
 * height, font size, and icon indent than its neighbours.
 */
export function DeleteMenuItem(props: {
  sessionId: string;
  displayTitle: string;
  t: T;
  setMenuOpen: (open: boolean) => void;
  onAsk: (target: DeleteTarget) => void;
}) {
  const { sessionId, displayTitle, t, setMenuOpen, onAsk } = props;
  return (
    <MenuItemButton
      danger
      separatorBefore
      icon={<TrashIcon size={14} />}
      onSelect={() => {
        setMenuOpen(false);
        onAsk({ sessionId, displayTitle });
      }}
    >
      {t("delete")}
    </MenuItemButton>
  );
}

/**
 * The confirmation for a single delete, rendered from `shell.overlay`.
 *
 * Living outside the row is the point: `shell.overlay` is root-scoped and
 * always mounted, so nothing the row does to itself can unmount this.
 */
export function DeleteConfirmer(props: {
  target: DeleteTarget;
  t: T;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { target, t, busy, onConfirm, onCancel } = props;
  const title = target.displayTitle.trim() || target.sessionId;
  return (
    <Dialog
      title={t("confirmOne", { title })}
      confirmLabel={t("deleteAction")}
      cancelLabel={t("cancel")}
      danger
      busy={busy}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <p>{t("confirmBodyOne")}</p>
    </Dialog>
  );
}

/** Bulk confirmation shared by the sessions page. */
export function BulkDeleteDialog(props: {
  t: T;
  rows: Array<{ sessionId: string; title: string; running: boolean }>;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t, rows, busy, onConfirm, onCancel } = props;
  const running = rows.filter((row) => row.running).length;
  return (
    <Dialog
      title={t("confirmMany", { count: rows.length })}
      confirmLabel={t("deleteAction")}
      cancelLabel={t("cancel")}
      danger
      busy={busy}
      onConfirm={onConfirm}
      onCancel={onCancel}
    >
      <p>{t("confirmBodyMany")}</p>
      {running > 0 ? <p className="cm-dialog-note">{t("confirmRunning", { count: running })}</p> : null}
      <DialogList items={rows.map((row) => row.title)} />
    </Dialog>
  );
}
