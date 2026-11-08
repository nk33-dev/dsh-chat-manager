import React from "react";
import type { Api } from "./api.ts";
import { type DeletedBatch } from "./DeleteAction.tsx";
import { type T } from "./locales.ts";
/**
 * The plugin's main panel: the trash and a searchable session list.
 *
 * Both views refetch after every mutation. These are small lists and the Host
 * is the authority on the archive set, so a refetch is cheaper to reason about
 * than a local mirror kept in sync by hand.
 */
export declare function ChatManagerPage(props: {
    api: Api;
    t: T;
    onDeleted: (batch: DeletedBatch, failures: string[]) => void;
}): React.JSX.Element;
