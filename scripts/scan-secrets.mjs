import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
const patterns = [
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /github_pat_[A-Za-z0-9_]{35,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /discord(?:app)?\.com\/api(?:\/v\d+)?\/webhooks\/\d+\/[A-Za-z0-9_-]+/,
  /\b(?:mfa\.[A-Za-z0-9_-]{30,}|[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{25,})\b/,
];
function files(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = `${dir}/${f}`;
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}
const tracked = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard"],
  { encoding: "utf8" },
)
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);
let bad = false;
for (const path of [...new Set([...tracked, ...files("dist")])]) {
  if (!existsSync(path)) continue;
  if (
    path === "package-lock.json" ||
    path.endsWith(".png") ||
    path.endsWith(".jpg")
  )
    continue;
  const content = readFileSync(path, "utf8");
  if (
    patterns.some((p) => p.test(content)) ||
    (path.startsWith("dist/") &&
      /BNET_CLIENT_SECRET|IDENTITY_KEY|ADMIN_BNET_IDS|GITHUB_TOKEN/.test(
        content,
      ))
  ) {
    console.error(`Potential secret or server-only configuration in ${path}`);
    bad = true;
  }
}
if (bad) process.exit(1);
console.log(
  "Credential scan passed for source and public build. No secret values are printed.",
);
