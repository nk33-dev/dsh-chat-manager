import { z } from "zod";
import type { Json } from "./types.ts";

const json: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(json),
    z.record(z.string(), json),
  ]),
);

export const rpcRequestSchema = z
  .object({ action: z.string().min(1).max(80), payload: json })
  .strict();

export const rpcResponseSchema = z
  .object({ ok: z.boolean(), data: json, error: z.string() })
  .strict();

/** Payload of `delete` and `restore`: one or more session ids. */
export const sessionIdsSchema = z
  .object({ sessionIds: z.array(z.string().min(1)).min(1).max(200) })
  .strict();

/** Payload of `purge`: trash entry handles. */
export const trashIdsSchema = z
  .object({ trashIds: z.array(z.string().min(1)).min(1).max(200) })
  .strict();

/** Payload of `undo`: the single entry the toast reports. */
export const undoPayloadSchema = z
  .object({ trashId: z.string().min(1) })
  .strict();

/** Payload of `sessions.search`: a literal phrase, possibly empty. */
export const searchPayloadSchema = z
  .object({
    query: z.string().max(200),
    includeArchived: z.boolean().default(false),
  })
  .strict();
