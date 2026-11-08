import React from "react";
import type { Context } from "@deepseek-ai/cordis";
import type { TypertRemoteContribution } from "@deepseek-ai/dsh-typert-protocol";
import type { RemoteNamespace } from "./api.ts";
import { zh, type T } from "./locales.ts";
export declare const inject: string[];
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
        register(namespace: string, dictionaries: {
            en: object;
            zh: object;
        }): () => void;
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
export declare function rewriteHostWorkspaceCopy(locale: BrowserHost["locale"]): () => boolean;
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
export declare function captureLocaleRegistrations(locale: BrowserHost["locale"], after: () => void): () => void;
export declare function apply(ctx: Context): Promise<void>;
export {};
