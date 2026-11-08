import { writeFile } from "node:fs/promises";

const port = 19473;
const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const target = targets.find((t) => t.type === "page");
if (!target) throw new Error("No Harness page");

const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

let sequence = 0;
const pending = new Map();
socket.addEventListener("message", (event) => {
  const packet = JSON.parse(event.data);
  if (packet.id && pending.has(packet.id)) {
    const { resolve, reject } = pending.get(packet.id);
    pending.delete(packet.id);
    packet.error ? reject(new Error(packet.error.message)) : resolve(packet.result);
  }
});

function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function evaluate(expression) {
  const response = await call("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result.value;
}

async function shot(path, clip) {
  const { data } = await call("Page.captureScreenshot", {
    format: "png",
    ...(clip ? { clip: { ...clip, scale: 2 } } : {}),
  });
  await writeFile(path, Buffer.from(data, "base64"));
  console.log("saved", path);
}

globalThis.browser = { call, evaluate, shot, socket };

const script = process.argv[2];
if (script) {
  await import(new URL(script, import.meta.url).href);
  socket.close();
}
