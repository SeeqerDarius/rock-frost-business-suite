import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const binaries = {
  next: require.resolve("next/dist/bin/next"),
  prisma: require.resolve("prisma/build/index.js"),
};

const production = process.env.VERCEL_ENV === "production";
const commands = production
  ? [["prisma", ["migrate", "deploy"]], ["next", ["build"]]]
  : [["next", ["build"]]];

for (const [command, args] of commands) {
  const result = spawnSync(process.execPath, [binaries[command], ...args], { stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
