import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const output = resolve(root, "dist");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of ["index.html", "local-redirect.js", "app.js", "styles.css", "manifest.webmanifest", "sw.js"]) {
  await cp(resolve(root, file), resolve(output, file));
}

const publicAssets = [
  "assets/catv-network-bg.svg",
  "assets/catv-network-bg.jpg",
  "assets/catv-network-bg.png",
  "assets/catv-app-icon.svg",
  "assets/catv-topbar-symbol.png",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
];

for (const asset of publicAssets) {
  const destination = resolve(output, asset);
  await mkdir(dirname(destination), { recursive: true });
  await cp(resolve(root, asset), destination);
}

console.log("Vercel public shell built in dist/. Protected DB and diagram assets stay on the backend.");
