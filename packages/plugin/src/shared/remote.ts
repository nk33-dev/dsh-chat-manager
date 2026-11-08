import type { InvocationDescriptor, TypertRemoteContribution } from "@deepseek-ai/dsh-typert-protocol";
import { rpcRequestSchema, rpcResponseSchema } from "./schemas.ts";

// One unary endpoint carries every action; the schema pair is the only
// contract that crosses the wire, so the browser half cannot send anything the
// Host would not validate.
const request: InvocationDescriptor = {
  id: "@dsh-chat-manager/plugin#chatmanager/request",
  namespace: "chatmanager",
  service: "chatmanager",
  method: "request",
  invocation: { kind: "direct" },
  parameters: [
    {
      name: "request",
      wire: "request",
      source: "json",
      codec: {
        mode: "strict",
        typeSymbol: "ChatManagerRequest",
        create: () => rpcRequestSchema,
      },
    },
  ],
  cancellation: { parameter: "signal" },
  result: {
    mode: "strict",
    typeSymbol: "ChatManagerResponse",
    create: () => rpcResponseSchema,
  },
};

export const remoteContribution: TypertRemoteContribution = {
  package: "@dsh-chat-manager/plugin",
  descriptors: [request],
};
