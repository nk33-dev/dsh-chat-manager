import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { verifyClientBundle } from "./verify-client.mjs";

const { version, engines } = JSON.parse(
  await readFile("packages/plugin/package.json", "utf8"),
);
const path = `dist/chat-manager-${version}.tgz`;
const archive = await readFile(path);
const tar = gunzipSync(archive);
const files = new Map();

for (let offset = 0; offset + 512 <= tar.length; ) {
  const header = tar.subarray(offset, offset + 512);
  const name = header.subarray(0, 100).toString().replace(/\0.*$/s, "");
  if (!name) break;
  const size =
    parseInt(header.subarray(124, 136).toString().replace(/\0.*$/s, "").trim(), 8) || 0;
  if (offset + 512 + size > tar.length) throw new Error("Truncated archive");
  files.set(name, tar.subarray(offset + 512, offset + 512 + size));
  offset += 512 + Math.ceil(size / 512) * 512;
}

for (const required of [
  "lib/index.js",
  "lib/remote.js",
  "lib/client.js",
  "cordis.patch.yml",
  "locale/zh.json",
  "locale/en.json",
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
]) {
  if (!files.has(`package/${required}`)) throw new Error(`Missing runtime file: ${required}`);
}

if (
  [...files.keys()].some((name) =>
    /node_modules|\.env|\.credentials|work\/|tests\/|tsbuildinfo/.test(name),
  )
) {
  throw new Error("Unexpected package contents");
}

const manifest = JSON.parse(files.get("package/package.json").toString("utf8"));
if (
  manifest.license !== "MIT" ||
  manifest.version !== version ||
  manifest.engines.dsh !== engines.dsh ||
  manifest.engines.node !== engines.node
) {
  throw new Error("Manifest mismatch");
}

const client = await verifyClientBundle(files.get("package/lib/client.js").toString("utf8"));

console.log(
  JSON.stringify(
    {
      path,
      files: files.size,
      size: archive.length,
      sha256: createHash("sha256").update(archive).digest("hex"),
      checks: [
        "runtime files",
        "locales",
        "licenses",
        "host compatibility",
        "client module factory",
        "client activation",
        "no private or development files",
      ],
      client,
    },
    null,
    2,
  ),
);
