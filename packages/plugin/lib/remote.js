import { z } from "zod";
//#region src/shared/schemas.ts
const json = z.lazy(() => z.union([
	z.null(),
	z.boolean(),
	z.number().finite(),
	z.string(),
	z.array(json),
	z.record(z.string(), json)
]));
const rpcRequestSchema = z.object({
	action: z.string().min(1).max(80),
	payload: json
}).strict();
const rpcResponseSchema = z.object({
	ok: z.boolean(),
	data: json,
	error: z.string()
}).strict();
z.object({ sessionIds: z.array(z.string().min(1)).min(1).max(200) }).strict();
z.object({ trashIds: z.array(z.string().min(1)).min(1).max(200) }).strict();
z.object({ trashId: z.string().min(1) }).strict();
z.object({
	query: z.string().max(200),
	includeArchived: z.boolean().default(false)
}).strict();
const remoteContribution = {
	package: "@dsh-chat-manager/plugin",
	descriptors: [{
		id: "@dsh-chat-manager/plugin#chatmanager/request",
		namespace: "chatmanager",
		service: "chatmanager",
		method: "request",
		invocation: { kind: "direct" },
		parameters: [{
			name: "request",
			wire: "request",
			source: "json",
			codec: {
				mode: "strict",
				typeSymbol: "ChatManagerRequest",
				create: () => rpcRequestSchema
			}
		}],
		cancellation: { parameter: "signal" },
		result: {
			mode: "strict",
			typeSymbol: "ChatManagerResponse",
			create: () => rpcResponseSchema
		}
	}]
};
//#endregion
export { remoteContribution };
