import { z } from "zod";
import type { Json } from "./types.ts";
export declare const rpcRequestSchema: z.ZodObject<{
    action: z.ZodString;
    payload: z.ZodType<Json, unknown, z.core.$ZodTypeInternals<Json, unknown>>;
}, z.core.$strict>;
export declare const rpcResponseSchema: z.ZodObject<{
    ok: z.ZodBoolean;
    data: z.ZodType<Json, unknown, z.core.$ZodTypeInternals<Json, unknown>>;
    error: z.ZodString;
}, z.core.$strict>;
/** Payload of `delete` and `restore`: one or more session ids. */
export declare const sessionIdsSchema: z.ZodObject<{
    sessionIds: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
/** Payload of `purge`: trash entry handles. */
export declare const trashIdsSchema: z.ZodObject<{
    trashIds: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
/** Payload of `undo`: the single entry the toast reports. */
export declare const undoPayloadSchema: z.ZodObject<{
    trashId: z.ZodString;
}, z.core.$strict>;
/** Payload of `sessions.search`: a literal phrase, possibly empty. */
export declare const searchPayloadSchema: z.ZodObject<{
    query: z.ZodString;
    includeArchived: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strict>;
