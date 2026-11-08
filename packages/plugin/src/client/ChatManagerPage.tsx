import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { SessionRow, TrashEntry, WorkspaceDeleteReport } from "../shared/types.ts";
import type { Api } from "./api.ts";
import { batchOf, BulkDeleteDialog, type DeletedBatch } from "./DeleteAction.tsx";
import { formatBytes, formatTime, type T } from "./locales.ts";
import { Dialog, DialogList, useDebounced } from "./ui.tsx";

type View = "trash" | "sessions";

/**
 * The plugin's main panel: the trash and a searchable session list.
 *
 * Both views refetch after every mutation. These are small lists and the Host
 * is the authority on the archive set, so a refetch is cheaper to reason about
 * than a local mirror kept in sync by hand.
 */
export function ChatManagerPage(props: {
  api: Api;
  t: T;
  onDeleted: (batch: DeletedBatch, failures: string[]) => void;
}) {
  const { api, t, onDeleted } = props;
  const [view, setView] = useState<View>("trash");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [entries, setEntries] = useState<TrashEntry[]>([]);
  const [trashLoaded, setTrashLoaded] = useState(false);

  const [rows, setRows] = useState<SessionRow[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [chosen, setChosen] = useState<string[]>([]);
  const [confirmRows, setConfirmRows] = useState<SessionRow[] | undefined>(undefined);
  const [purgeTargets, setPurgeTargets] = useState<TrashEntry[] | undefined>(undefined);
  const [report, setReport] = useState<WorkspaceDeleteReport | null>(null);

  const settledQuery = useDebounced(query, 180);

  const refreshTrash = useCallback(async () => {
    try {
      setEntries(await api.listTrash());
      setTrashLoaded(true);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }, [api]);

  const refreshSessions = useCallback(
    async (text: string, archived: boolean) => {
      try {
        setRows(await api.search(text, archived));
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : String(reason));
      } finally {
        // Without this the view renders its empty state before the first reply
        // lands, which reads as "no sessions" for a moment on every visit.
        setSessionsLoaded(true);
      }
    },
    [api],
  );

  useEffect(() => {
    void refreshTrash();
  }, [refreshTrash]);

  // The workspace delete happens in the Host and its dialog belongs to the
  // Host, so its own wording cannot be corrected. Reporting here is how the
  // user learns what actually happened to those sessions.
  useEffect(() => {
    void api
      .workspaceReport()
      .then(setReport)
      .catch(() => setReport(null));
  }, [api]);

  useEffect(() => {
    void refreshSessions(settledQuery, includeArchived);
  }, [refreshSessions, settledQuery, includeArchived]);

  const deleteChosen = async (targets: SessionRow[]) => {
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
      setConfirmRows(undefined);
    }
  };

  const restoreEntries = async (targets: TrashEntry[]) => {
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

  const purgeEntries = async (targets: TrashEntry[]) => {
    setBusy(true);
    setError("");
    try {
      await api.purge(targets.map((entry) => entry.trashId));
      await refreshTrash();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
      setPurgeTargets(undefined);
    }
  };

  const chosenRows = useMemo(
    () => rows.filter((row) => chosen.includes(row.sessionId)),
    [rows, chosen],
  );

  return (
    <div className="cm-page">
      <div className="cm-header">
        <h1>{view === "trash" ? t("trashTitle") : t("sessionsTitle")}</h1>
        <span className="cm-count">
          {/* Both views show a count. An empty span still paints the pill, so
              leaving it blank for one view drew a stray capsule. */}
          {view === "trash"
            ? t("trashCount", { count: entries.length })
            : t("trashCount", { count: rows.length })}
        </span>
        <span className="cm-spacer" />
      </div>
      <p className="cm-sub">{view === "trash" ? t("trashNote") : t("sessionsNote")}</p>

      <div className="cm-tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className="cm-tab"
          aria-selected={view === "trash"}
          onClick={() => setView("trash")}
        >
          {t("trashTitle")}
        </button>
        <button
          type="button"
          role="tab"
          className="cm-tab"
          aria-selected={view === "sessions"}
          onClick={() => setView("sessions")}
        >
          {t("sessionsTitle")}
        </button>
      </div>

      {error !== "" ? <p className="cm-error">{error}</p> : null}

      {report !== null ? (
        <div className="cm-report" role="status">
          <p className="cm-report-text">
            {report.sessionIds.length === 0
              ? t("workspaceDeletedEmpty", { title: report.title })
              : t("workspaceDeleted", {
                  title: report.title,
                  count: report.trashIds.length,
                })}
            {report.warnings.length > 0 ? (
              <>
                {" "}
                {t("workspaceDeletedPartial", { count: report.warnings.length })}
              </>
            ) : null}
          </p>
          <button
            type="button"
            className="cm-button"
            data-tone="ghost"
            onClick={() => setReport(null)}
          >
            {t("workspaceDeletedDismiss")}
          </button>
        </div>
      ) : null}

      {view === "trash" ? (
        <TrashList
          t={t}
          entries={entries}
          loaded={trashLoaded}
          busy={busy}
          onRestore={(targets) => void restoreEntries(targets)}
          onPurge={(targets) => setPurgeTargets(targets)}
        />
      ) : (
        <SessionList
          t={t}
          rows={rows}
          loaded={sessionsLoaded}
          query={query}
          includeArchived={includeArchived}
          chosen={chosen}
          busy={busy}
          onQuery={setQuery}
          onIncludeArchived={setIncludeArchived}
          onToggle={(id) =>
            setChosen((current) =>
              current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
            )
          }
          onSelectAll={() => setChosen(rows.map((row) => row.sessionId))}
          onClear={() => setChosen([])}
          onAskDelete={(targets) => setConfirmRows(targets)}
          chosenRows={chosenRows}
        />
      )}

      {confirmRows !== undefined ? (
        <BulkDeleteDialog
          t={t}
          rows={confirmRows}
          busy={busy}
          onConfirm={() => void deleteChosen(confirmRows)}
          onCancel={() => {
            if (!busy) setConfirmRows(undefined);
          }}
        />
      ) : null}

      {purgeTargets !== undefined ? (
        <Dialog
          title={
            purgeTargets.length === 1
              ? t("purgeTitleOne", { title: purgeTargets[0].title })
              : t("purgeTitleMany", { count: purgeTargets.length })
          }
          confirmLabel={t("purge")}
          cancelLabel={t("cancel")}
          danger
          busy={busy}
          onConfirm={() => void purgeEntries(purgeTargets)}
          onCancel={() => {
            if (!busy) setPurgeTargets(undefined);
          }}
        >
          <p>{purgeTargets.length === 1 ? t("purgeBodyOne") : t("purgeBodyMany")}</p>
          {purgeTargets.length > 1 ? (
            <DialogList items={purgeTargets.map((entry) => entry.title)} />
          ) : null}
        </Dialog>
      ) : null}
    </div>
  );
}

function TrashList(props: {
  t: T;
  entries: TrashEntry[];
  loaded: boolean;
  busy: boolean;
  onRestore: (targets: TrashEntry[]) => void;
  onPurge: (targets: TrashEntry[]) => void;
}) {
  const { t, entries, loaded, busy, onRestore, onPurge } = props;
  if (!loaded) return <div className="cm-empty"><p className="cm-empty-title">{t("loading")}</p></div>;
  if (entries.length === 0) {
    return (
      <div className="cm-empty">
        <p className="cm-empty-title">{t("trashEmpty")}</p>
        <p className="cm-empty-hint">{t("trashEmptyHint")}</p>
      </div>
    );
  }
  return (
    <>
      <div className="cm-toolbar">
        <button type="button" className="cm-button" disabled={busy} onClick={() => onRestore(entries)}>
          {t("restoreAll")}
        </button>
        <button
          type="button"
          className="cm-button"
          data-tone="ghost"
          disabled={busy}
          onClick={() => onPurge(entries)}
        >
          {t("purgeAll")}
        </button>
      </div>
      <div className="cm-list">
        {entries.map((entry) => (
          <div key={entry.trashId} className="cm-item">
            <div className="cm-item-main">
              <div className="cm-item-title" title={entry.title}>
                {entry.title}
              </div>
              <div className="cm-item-meta">
                {entry.cwd}
                <span className="cm-dot">·</span>
                {formatBytes(entry.sizeBytes)}
                <span className="cm-dot">·</span>
                {t("deletedAt", { time: formatTime(entry.deletedAt) })}
              </div>
            </div>
            <div className="cm-item-actions">
              <button
                type="button"
                className="cm-button"
                disabled={busy}
                onClick={() => onRestore([entry])}
              >
                {t("restore")}
              </button>
              <button
                type="button"
                className="cm-button"
                data-tone="ghost"
                disabled={busy}
                onClick={() => onPurge([entry])}
              >
                {t("purge")}
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function SessionList(props: {
  t: T;
  rows: SessionRow[];
  loaded: boolean;
  query: string;
  includeArchived: boolean;
  chosen: string[];
  chosenRows: SessionRow[];
  busy: boolean;
  onQuery: (value: string) => void;
  onIncludeArchived: (value: boolean) => void;
  onToggle: (id: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onAskDelete: (targets: SessionRow[]) => void;
}) {
  const { t, rows, loaded, query, includeArchived, chosen, chosenRows, busy } = props;
  if (!loaded) {
    return (
      <div className="cm-empty">
        <p className="cm-empty-title">{t("loading")}</p>
      </div>
    );
  }
  return (
    <>
      <div className="cm-toolbar">
        <label className="cm-search">
          <input
            type="search"
            value={query}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            onChange={(event) => props.onQuery(event.target.value)}
          />
        </label>
        <label className="cm-switch">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(event) => props.onIncludeArchived(event.target.checked)}
          />
          {t("includeArchived")}
        </label>
      </div>

      {chosen.length > 0 ? (
        <div className="cm-bulk">
          <strong>{t("selectedCount", { count: chosen.length })}</strong>
          <span className="cm-spacer" />
          <button type="button" className="cm-button" data-tone="ghost" onClick={props.onClear}>
            {t("clearSelection")}
          </button>
          <button
            type="button"
            className="cm-button"
            data-tone="danger"
            disabled={busy}
            onClick={() => props.onAskDelete(chosenRows)}
          >
            {t("deleteSelected", { count: chosen.length })}
          </button>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="cm-empty">
          <p className="cm-empty-title">{t("sessionsEmpty")}</p>
          {/* Telling someone to tick a box that is already ticked is a dead end. */}
          {includeArchived ? null : <p className="cm-empty-hint">{t("sessionsEmptyHint")}</p>}
        </div>
      ) : (
        <>
          <div className="cm-toolbar">
            <label className="cm-switch">
              <input
                type="checkbox"
                checked={chosen.length > 0 && chosen.length === rows.length}
                ref={(node) => {
                  if (node !== null) node.indeterminate = chosen.length > 0 && chosen.length < rows.length;
                }}
                onChange={() => (chosen.length === rows.length ? props.onClear() : props.onSelectAll())}
              />
              {t("selectAll")}
            </label>
          </div>
          <div className="cm-list">
            {rows.map((row) => (
              <div
                key={row.sessionId}
                className="cm-item"
                data-selected={chosen.includes(row.sessionId)}
              >
                <input
                  type="checkbox"
                  className="cm-check"
                  checked={chosen.includes(row.sessionId)}
                  onChange={() => props.onToggle(row.sessionId)}
                  aria-label={row.title}
                />
                <div className="cm-item-main">
                  <div className="cm-item-title" title={row.title}>
                    {row.title}
                  </div>
                  <div className="cm-item-meta">
                    {row.cwd}
                    {row.running ? (
                      <>
                        <span className="cm-dot">·</span>
                        {t("running")}
                      </>
                    ) : null}
                    {row.archived ? (
                      <>
                        <span className="cm-dot">·</span>
                        {t("archived")}
                      </>
                    ) : null}
                    <span className="cm-dot">·</span>
                    {formatTime(row.updatedAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
