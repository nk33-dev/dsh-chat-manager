import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Renders scripts/preview.html in the running Harness window and captures it.
// A fixture keeps real session titles out of the published screenshot.
const page = await (
  await fetch("http://127.0.0.1:19473/json/list")
).json();
const target = page.find((t) => t.type === "page");
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

const call = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });

const html = await (await import("node:fs/promises")).readFile(
  new URL("./preview.html", import.meta.url),
  "utf8",
);
const url = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;

await call("Page.navigate", { url });
await new Promise((r) => setTimeout(r, 1200));

const shots = [
  { name: "sidebar-row", width: 520, height: 300, show: "shot-three" },
  { name: "trash-page", width: 1040, height: 480, show: null },
  { name: "delete-confirm", width: 940, height: 480, show: "shot-two" },
];

for (const { name, width, height, show } of shots) {
  await call("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await call("Runtime.evaluate", {
    expression: `(() => {
      document.body.firstElementChild.style.display = ${show ? '"none"' : '""'};
      for (const id of ["shot-two", "shot-three"]) {
        const node = document.getElementById(id);
        if (node) node.dataset.on = id === ${JSON.stringify(show)} ? "true" : "false";
      }
      return true;
    })()`,
  });
  await new Promise((r) => setTimeout(r, 400));
  const { data } = await call("Page.captureScreenshot", { format: "png" });
  const path = fileURLToPath(new URL(`../docs/images/${name}.png`, import.meta.url));
  await writeFile(path, Buffer.from(data, "base64"));
  console.log("saved", path);
}

await call("Emulation.clearDeviceMetricsOverride");
socket.close();
