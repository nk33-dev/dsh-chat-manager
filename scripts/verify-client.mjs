import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { Script } from "node:vm";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../packages/plugin/package.json", import.meta.url));

// Modules the Harness module loader hands to a packaged client plugin. Anything
// else in the bundle would fail at activation, not at build time. `react-dom`
// is here because shipped plugins in the wild load it this way (the market
// plugin does), and the dialog portal needs it.
const provided = new Set([
  "react",
  "react/jsx-runtime",
  "react-dom",
  "zod",
  "@deepseek-ai/cordis",
  // The host's own component library, already loaded for every slot occupant.
  "@deepseek-ai/dsh-client-ui-primitives",
]);

/** Slots this plugin must contribute, in registration order. */
const expectedSlots = [
  "main",
  // Two overlay occupants: the delete confirmation and the undo toast. The
  // confirmation lives here, not in the row, because the row's action strip is
  // hidden whenever it is not hovered.
  "shell.overlay",
  "shell.overlay",
  "sidebar.panellist",
  "sidebar.workspaces.session.menu.item",
  "sidebar.workspaces.session.row.action",
];

export async function verifyClientBundle(source) {
  const registrations = [];
  const imports = new Set();
  const styles = [];
  const slots = [];
  const cleanups = [];

  const element = () => ({ dataset: {}, textContent: "", remove() {} });
  const document = {
    createElement: element,
    head: { appendChild: (node) => styles.push(node) },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  const window = {
    __ModuleLoader__: { load: (definition) => registrations.push(definition) },
    setTimeout: () => 0,
    clearTimeout: () => {},
  };

  new Script(source, { filename: "chat-manager-client.js" }).runInNewContext(
    { window, document, console },
    { timeout: 10000 },
  );

  assert.equal(registrations.length, 1, "Client must register one package factory");
  const registration = registrations[0];
  assert.equal(registration.id, "@dsh-chat-manager/plugin");

  const exports = registration.factory((specifier) => {
    if (!provided.has(specifier)) {
      throw new Error(`Client dependency is unavailable in Harness: ${specifier}`);
    }
    imports.add(specifier);
    // The host's primitives ship CSS modules, which Node cannot import. Their
    // presence in the whitelist is what matters here; the bundle is not run
    // against the real library.
    if (specifier === "@deepseek-ai/dsh-client-ui-primitives") {
      return { MenuItemButton: () => null };
    }
    return require(specifier);
  });
  assert.equal(typeof exports.apply, "function");

  const host = {
    effect: (callback) => {
      const cleanup = callback();
      if (cleanup) cleanups.push(cleanup);
    },
    inject: (_services, callback) => callback(host),
    locale: { register: () => () => {} },
    layout: { selectPanel: () => {} },
    remote: { $mount: async () => () => {}, chatmanager: {} },
    slots: {
      inject: (_name, callback) => callback(),
      register: (options, component) => {
        assert.equal(typeof component, "function", `Slot ${options.name} has no component`);
        slots.push(options.name);
        return () => {};
      },
    },
  };

  try {
    await exports.apply(host);
    assert.deepEqual([...slots].sort(), [...expectedSlots].sort());
    assert.equal(styles.length, 1, "Client must inject exactly one stylesheet");
  } finally {
    for (const cleanup of cleanups.reverse()) cleanup();
  }
  return { imports: [...imports].sort(), slots };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await verifyClientBundle(
    await readFile(new URL("../packages/plugin/lib/client.js", import.meta.url), "utf8"),
  );
  console.log(JSON.stringify({ status: "ok", ...result }));
}
