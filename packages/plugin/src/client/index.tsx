import React from "react";
import type { Context } from "@deepseek-ai/cordis";
import type {} from "@deepseek-ai/dsh-client-ui-slots";
import type { TypertRemoteContribution } from "@deepseek-ai/dsh-typert-protocol";
import { remoteContribution } from "../shared/remote.ts";
import type { RemoteNamespace } from "./api.ts";
import { Api } from "./api.ts";
import { ChatManagerPage } from "./ChatManagerPage.tsx";
import {
  batchOf,
  DeleteConfirmer,
  DeleteMenuItem,
  DeleteRowAction,
  type DeletedBatch,
  type DeleteTarget,
} from "./DeleteAction.tsx";
import { en, zh, type T } from "./locales.ts";
import { css } from "./style.ts";
import { ToastHost, TrashIcon } from "./ui.tsx";

export const inject = ["slots", "locale", "remote"];

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
const HOST_WORKSPACE_DELETE_COPY: Record<string, Record<string, string>> = {
  zh: {
    "delete.desc":
      "将把「{name}」和里面的会话一起删除。会话会移到回收站，可以恢复。",
  },
  en: {
    "delete.desc":
      "Deletes “{name}” and the sessions inside it. They move to the trash and can be restored.",
  },
};

// Runtime key set for the namespace; the declaration is what makes slot
// components receive a typed `t` seat instead of an untyped string lookup.
declare module "@deepseek-ai/dsh-client-ui-slots" {
  interface LocaleNamespaceMap {
    chatmanager: keyof typeof zh;
  }
}

interface BrowserHost {
  remote: {
    $mount(contribution: TypertRemoteContribution): Promise<() => void>;
    chatmanager: RemoteNamespace;
  };
  locale: {
    register(namespace: string, dictionaries: { en: object; zh: object }): () => void;
    /** Typed translate bound to one namespace; re-read on every projection. */
    bind(namespace: string): T;
    /** Loaded dictionaries, keyed by namespace then locale. Same shape `lookup` reads. */
    dicts?: Map<string, Map<string, Record<string, string>>>;
  };
  slots: {
    inject(name: string, callback: () => () => void): () => void;
    register(options: object, component: React.ComponentType<never>): () => void;
  };
}

/**
 * One toast at a time. `shell.overlay` renders whatever is registered, so the
 * banner is torn down by clearing this store rather than by unmounting a
 * registration.
 */
interface ToastState {
  message: string;
  trashIds: string[];
}

type ToastListener = (state: ToastState | undefined) => void;

class ToastStore {
  private state: ToastState | undefined;
  private readonly listeners = new Set<ToastListener>();

  get current(): ToastState | undefined {
    return this.state;
  }

  publish(state: ToastState | undefined): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }

  subscribe = (listener: ToastListener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}

/** Overlay occupant: the current toast, or nothing. */
function ToastSeat(props: {
  store: ToastStore;
  t: T;
  onUndo: (trashIds: string[]) => void;
}) {
  const { store, t, onUndo } = props;
  const [state, setState] = React.useState<ToastState | undefined>(store.current);
  React.useEffect(() => store.subscribe(setState), [store]);
  if (state === undefined) return null;
  const undoable = state.trashIds.length > 0;
  return (
    <ToastHost
      message={state.message}
      actionLabel={undoable ? t("undo") : undefined}
      onAction={undoable ? () => onUndo(state.trashIds) : undefined}
      onDone={() => store.publish(undefined)}
    />
  );
}

/**
 * The pending single-delete request, held outside every row.
 *
 * The row's action strip is hidden with `display:none` whenever the row is not
 * hovered, and a dialog rendered inside it was seen to flash and disappear.
 * `shell.overlay` is root-scoped and always mounted, so the confirmation lives
 * here and the rows only raise requests into it.
 */
class ConfirmStore {
  private target: DeleteTarget | undefined;
  private busy = false;
  private readonly listeners = new Set<() => void>();

  get current(): { target: DeleteTarget | undefined; busy: boolean } {
    return { target: this.target, busy: this.busy };
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private notify(): void {
    for (const listener of this.listeners) listener();
  }

  ask(target: DeleteTarget): void {
    this.target = target;
    this.busy = false;
    this.notify();
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
    this.notify();
  }

  close(): void {
    if (this.busy) return;
    this.target = undefined;
    this.notify();
  }
}

/** Overlay occupant: the pending delete confirmation, or nothing. */
function ConfirmSeat(props: {
  store: ConfirmStore;
  t: T;
  run: (target: DeleteTarget) => Promise<void>;
}) {
  const { store, t, run } = props;
  const [state, setState] = React.useState(store.current);
  React.useEffect(() => {
    setState(store.current);
    return store.subscribe(() => setState(store.current));
  }, [store]);
  if (state.target === undefined) return null;
  const target = state.target;
  return (
    <DeleteConfirmer
      target={target}
      t={t}
      busy={state.busy}
      onConfirm={() => void run(target)}
      onCancel={() => store.close()}
    />
  );
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
export function rewriteHostWorkspaceCopy(locale: BrowserHost["locale"]): () => boolean {
  const dicts = locale.dicts;
  if (!(dicts instanceof Map)) return () => false;
  const restored: Array<() => void> = [];
  for (const locales of dicts.values()) {
    for (const [language, entries] of locales) {
      const replacements = HOST_WORKSPACE_DELETE_COPY[language.slice(0, 2)];
      if (replacements === undefined) continue;
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
export function captureLocaleRegistrations(
  locale: BrowserHost["locale"],
  after: () => void,
): () => void {
  const original = locale.register;
  if (typeof original !== "function") return () => undefined;
  let active = true;
  locale.register = function patched(...args: Parameters<BrowserHost["locale"]["register"]>) {
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

export async function apply(ctx: Context) {
  try {
    const host = ctx as unknown as BrowserHost;

    ctx.effect(() => host.locale.register(NS, { en, zh }));
    ctx.effect(() => captureLocaleRegistrations(host.locale, () => rewriteHostWorkspaceCopy(host.locale)));
    const unmountRemote = await host.remote.$mount(remoteContribution);
    ctx.effect(() => unmountRemote);

    ctx.inject(["remote.chatmanager", "remote", "slots", "locale"], (child) => {
      const services = child as unknown as BrowserHost;
      const api = new Api(services.remote.chatmanager);
      // The panel row's label is a thunk the sidebar re-reads on locale change,
      // so it goes through the locale service rather than a captured string.
      const bound = (key: keyof typeof zh) => services.locale.bind(NS)(key);
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

      // A dialog slot's own `t` is only available while it renders; the store
      // that drives it lives outside. Asking the locale service directly gives
      // the same dictionary without threading a render-time prop through.
      const translate = (): T => services.locale.bind(NS);

      const publish = (batch: DeletedBatch, failures: string[], t: T) => {
        if (batch.trashIds.length === 0) {
          // Nothing reached the trash: the failure report is the whole message.
          toasts.publish({
            message: failures[0] ?? t("failedGeneric"),
            trashIds: [],
          });
          return;
        }
        const message =
          batch.trashIds.length === 1
            ? t("deletedOne", { title: batch.titles[0] ?? batch.sessionIds[0] })
            : t("deletedMany", { count: batch.trashIds.length });
        toasts.publish({
          message: failures.length === 0 ? message : `${message} · ${failures[0]}`,
          trashIds: batch.trashIds,
        });
      };

      const undo = async (trashIds: string[]) => {
        for (const trashId of trashIds) {
          // One failed undo must not strand the rest; the Host reports per entry.
          await api.undo(trashId).catch(() => undefined);
        }
      };

      const runDelete = async (target: DeleteTarget) => {
        confirm.setBusy(true);
        try {
          const outcome = batchOf(await api.deleteSessions([target.sessionId]));
          publish(outcome.batch, outcome.failures, translate());
        } catch (error) {
          publish(
            { trashIds: [], sessionIds: [], titles: [] },
            [error instanceof Error ? error.message : String(error)],
            translate(),
          );
        } finally {
          confirm.setBusy(false);
          confirm.close();
        }
      };

      services.slots.inject("shell.overlay", () =>
        services.slots.register(
          { name: "shell.overlay", id: "chat-manager-confirm", locale: NS },
          ((props: { t: T }) =>
            React.createElement(ConfirmSeat, {
              store: confirm,
              t: props.t,
              run: runDelete,
            })) as unknown as React.ComponentType<never>,
        ),
      );

      services.slots.inject("shell.overlay", () =>
        services.slots.register(
          { name: "shell.overlay", id: "chat-manager-toast", locale: NS },
          ((props: { t: T }) =>
            React.createElement(ToastSeat, {
              store: toasts,
              t: props.t,
              onUndo: undo,
            })) as unknown as React.ComponentType<never>,
        ),
      );

      services.slots.inject("sidebar.workspaces.session.row.action", () =>
        services.slots.register(
          {
            name: "sidebar.workspaces.session.row.action",
            id: "chat-manager-delete",
            order: 700,
            locale: NS,
          },
          ((props: {
            sessionId: string;
            displayTitle: string;
            t: T;
            useSessionAccess: (id: string, action: string) => boolean;
          }) => {
            // Deleting archives first, so the row needs the permission
            // archiving needs: without it the button would fail every time.
            if (!props.useSessionAccess(props.sessionId, "workspace/archiveSession")) return null;
            return React.createElement(DeleteRowAction, {
              sessionId: props.sessionId,
              displayTitle: props.displayTitle,
              t: props.t,
              onAsk: (target: DeleteTarget) => confirm.ask(target),
            });
          }) as unknown as React.ComponentType<never>,
        ),
      );

      services.slots.inject("sidebar.workspaces.session.menu.item", () =>
        services.slots.register(
          {
            name: "sidebar.workspaces.session.menu.item",
            id: "chat-manager-delete",
            order: 650,
            locale: NS,
          },
          ((props: {
            sessionId: string;
            displayTitle: string;
            t: T;
            useMenuOpenState: () => readonly [boolean, (open: boolean) => void];
            useSessionAccess: (id: string, action: string) => boolean;
          }) => {
            if (!props.useSessionAccess(props.sessionId, "workspace/archiveSession")) return null;
            const [, setMenuOpen] = props.useMenuOpenState();
            return React.createElement(DeleteMenuItem, {
              sessionId: props.sessionId,
              displayTitle: props.displayTitle || "",
              t: props.t,
              setMenuOpen,
              onAsk: (target: DeleteTarget) => confirm.ask(target),
            });
          }) as unknown as React.ComponentType<never>,
        ),
      );

      services.slots.inject("main", () =>
        services.slots.register(
          { name: "main", key: PANEL_ID, locale: NS },
          ((props: { t: T }) =>
            React.createElement(ChatManagerPage, {
              api,
              t: props.t,
              onDeleted: (batch: DeletedBatch, failures: string[]) =>
                publish(batch, failures, props.t),
            })) as unknown as React.ComponentType<never>,
        ),
      );

      services.slots.inject("sidebar.panellist", () =>
        services.slots.register(
          {
            name: "sidebar.panellist",
            id: PANEL_ID,
            order: 20,
            label: () => bound("trashTitle"),
            locale: NS,
          },
          // Same glyph as the row action, at whatever size the sidebar asks
          // for, so the panel row and the delete button read as one icon.
          ((owner: { size?: number; active?: boolean }) =>
            React.createElement(
              "span",
              {
                style: {
                  display: "inline-flex",
                  color: "currentColor",
                  opacity: owner.active ? 1 : 0.85,
                },
              },
              React.createElement(TrashIcon, { size: owner.size ?? 16 }),
            )) as unknown as React.ComponentType<never>,
        ),
      );
    });
  } catch (error) {
    console.error("Chat Manager activation failed", error);
    throw error;
  }
}
