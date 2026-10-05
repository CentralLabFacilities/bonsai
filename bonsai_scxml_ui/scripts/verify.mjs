import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [major, minor] = process.versions.node.split(".").map(Number);
if (!((major === 22 && minor >= 13) || major >= 24)) {
    console.error("Verification requires Node 22.13+ or 24+. Use the version in .node-version.");
    process.exit(1);
}
const args = process.argv.slice(2);
const selected = args[0] && !args[0].startsWith("--") ? args.shift() : "all";
const steps = selected === "all" ? ["lint", "unit", "rust", "build", "browser"]
    : selected === "browser" ? ["build", "browser"] : [selected];
const nodeEnv = { ...process.env, PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH || ""}` };
const appendLibraries = (env, directories) => ({
    ...env,
    LD_LIBRARY_PATH: [...directories.filter(existsSync), env.LD_LIBRARY_PATH].filter(Boolean).join(path.delimiter),
});

for (const step of steps) {
    let command = process.execPath;
    let options;
    let env = nodeEnv;
    switch (step) {
        case "lint": options = ["node_modules/eslint/bin/eslint.js", ".", "--max-warnings=0"]; break;
        case "unit": options = ["--test", "--test-reporter=spec", ...readdirSync(path.join(root, "tests"))
            .filter((name) => name.endsWith(".test.js")).sort().map((name) => `tests/${name}`)]; break;
        case "build": options = ["node_modules/vite/bin/vite.js", "build", ...(selected === "build" ? args : [])]; break;
        case "rust": {
            const local = path.join(root, ".pixi/envs/default");
            command = existsSync(path.join(local, "bin/cargo")) ? path.join(local, "bin/cargo") : "cargo";
            if (path.isAbsolute(command)) {
                env = appendLibraries({ ...env, PATH: `${path.join(local, "bin")}${path.delimiter}${env.PATH}` }, [path.join(local, "lib")]);
                const linker = path.join(local, "bin/x86_64-conda-linux-gnu-cc");
                if (process.platform === "linux" && process.arch === "x64" && existsSync(linker)) {
                    env.CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_LINKER ??= linker;
                }
                const cache = path.join(root, ".container-home/.cargo");
                if (existsSync(cache)) env.CARGO_HOME ??= cache;
            }
            options = ["test", "--manifest-path", "src-tauri/Cargo.toml", "--lib", "--no-default-features", "--locked"];
            break;
        }
        case "browser": {
            const local = path.join(root, ".container-home/.cache/browser-runtime");
            if (process.platform === "linux") {
                env = appendLibraries(env, [path.join(local, "lib/usr/lib/x86_64-linux-gnu"), path.join(local, "lib/lib/x86_64-linux-gnu")]);
                if (existsSync(path.join(local, "fonts.conf"))) env.FONTCONFIG_FILE ??= path.join(local, "fonts.conf");
            }
            options = ["node_modules/@playwright/test/cli.js", "test", ...args];
            break;
        }
        default: console.error(`Unknown verification step: ${step}`); process.exit(1);
    }
    console.log(`\nVerification: ${step}`);
    const result = spawnSync(command, options, { cwd: root, env, stdio: "inherit" });
    if (result.error) console.error(result.error.message);
    if (result.error || result.status !== 0) process.exit(result.status || 1);
}
