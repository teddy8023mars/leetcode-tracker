/**
 * Sandbox runner — execute user code in a child process with timeout + memory limit.
 *
 * Security note: this runs UNTRUSTED user code on the server.
 * For dev/preview we rely on:
 *   - Hard 5s wall-clock timeout (kills runaway loops)
 *   - 1GB virtual-mem cap via ulimit -v (kills memory bombs but allows CPython startup)
 *   - Each run gets a fresh tmp dir, deleted after
 * For production, this should be replaced with a real sandbox (Piston/Judge0/firecracker).
 */
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type SupportedLanguage = "python" | "java" | "cpp";

export interface RunRequest {
  language: SupportedLanguage;
  /** Full source program to compile + run. Must be self-contained. */
  source: string;
  /** Stdin input piped to the program. */
  stdin: string;
  /** Wall-clock timeout in ms. Default 5000. */
  timeoutMs?: number;
  /** Memory cap in MB (ulimit -v). Default 1024. */
  memoryMb?: number;
}

export interface RunResult {
  /** Whether the program ran to completion within limits. */
  ok: boolean;
  /** Reason for non-ok: compile_error | timeout | runtime_error | killed */
  reason?: "compile_error" | "timeout" | "runtime_error" | "killed";
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  /** Wall-clock execution time (compile + run for compiled langs). */
  timeMs: number;
  /** Compile-only stderr, separate from runtime stderr. */
  compileStderr?: string;
}

const MAX_OUTPUT_BYTES = 1024 * 64; // 64 KB cap on stdout/stderr each

function truncate(s: string): string {
  if (s.length <= MAX_OUTPUT_BYTES) return s;
  return s.slice(0, MAX_OUTPUT_BYTES) + `\n…[truncated, ${s.length - MAX_OUTPUT_BYTES} more bytes]`;
}

/** Run a single subprocess with stdin, timeout, ulimit. */
function execShellCmd(
  cmd: string,
  args: string[],
  opts: { stdin: string; cwd: string; timeoutMs: number; memoryMb: number },
): Promise<RunResult> {
  return new Promise((resolve) => {
    // Wrap with bash so we can apply ulimit -v (virtual memory cap, in KB).
    // ulimit -t adds CPU-time cap as a backup to wall-clock.
    const fullCmd = `ulimit -v ${opts.memoryMb * 1024}; ulimit -t ${Math.ceil(opts.timeoutMs / 1000) + 1}; exec "$@"`;
    // The dev-server process inherits PYTHONHOME / PYTHONPATH from the Manus sandbox
    // runtime (pointing at cpython-3.13). When we spawn /usr/bin/python3 (3.11) those
    // env vars cause it to load 3.13 stdlib against 3.11 C extensions, producing
    // "SRE module mismatch". Strip them so each interpreter uses its own prefix.
    const childEnv = { ...process.env } as Record<string, string | undefined>;
    delete childEnv.PYTHONHOME;
    delete childEnv.PYTHONPATH;
    delete childEnv.PYTHONSTARTUP;
    const child = spawn("bash", ["-c", fullCmd, "bash", cmd, ...args], {
      cwd: opts.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: childEnv as NodeJS.ProcessEnv,
    });
    const start = Date.now();
    let stdout = "";
    let stderr = "";
    let killedByTimeout = false;
    const timer = setTimeout(() => {
      killedByTimeout = true;
      try {
        child.kill("SIGKILL");
      } catch {}
    }, opts.timeoutMs);

    child.stdout.on("data", (d) => {
      stdout += d.toString("utf8");
      if (stdout.length > MAX_OUTPUT_BYTES * 2) child.kill("SIGKILL");
    });
    child.stderr.on("data", (d) => {
      stderr += d.toString("utf8");
      if (stderr.length > MAX_OUTPUT_BYTES * 2) child.kill("SIGKILL");
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        reason: "runtime_error",
        exitCode: null,
        signal: null,
        stdout: truncate(stdout),
        stderr: truncate(stderr + "\n" + (err.message ?? String(err))),
        timeMs: Date.now() - start,
      });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      const timeMs = Date.now() - start;
      if (killedByTimeout) {
        resolve({
          ok: false,
          reason: "timeout",
          exitCode: code,
          signal,
          stdout: truncate(stdout),
          stderr: truncate(stderr),
          timeMs,
        });
        return;
      }
      if (code !== 0) {
        resolve({
          ok: false,
          reason: "runtime_error",
          exitCode: code,
          signal,
          stdout: truncate(stdout),
          stderr: truncate(stderr),
          timeMs,
        });
        return;
      }
      resolve({
        ok: true,
        exitCode: code,
        signal,
        stdout: truncate(stdout),
        stderr: truncate(stderr),
        timeMs,
      });
    });

    if (opts.stdin) child.stdin.write(opts.stdin);
    child.stdin.end();
  });
}

export async function runUserCode(req: RunRequest): Promise<RunResult> {
  const timeoutMs = req.timeoutMs ?? 5000;
  // Default 1GB virtual mem cap. CPython 3.13 alone reserves ~300MB virtual address
  // space at startup (libc, mmaped .so files), so 256MB ulimit -v makes import fail
  // with "SRE module mismatch". 1024MB is a sane balance.
  const memoryMb = req.memoryMb ?? 1024;
  const dir = await fs.mkdtemp(path.join(tmpdir(), `lc-judge-${randomUUID()}-`));
  try {
    if (req.language === "python") {
      const file = path.join(dir, "main.py");
      await fs.writeFile(file, req.source, "utf8");
      return await execShellCmd("python3", [file], { stdin: req.stdin, cwd: dir, timeoutMs, memoryMb });
    }
    if (req.language === "cpp") {
      const src = path.join(dir, "main.cpp");
      const bin = path.join(dir, "main");
      await fs.writeFile(src, req.source, "utf8");
      const compile = await execShellCmd("g++", ["-O2", "-std=c++17", "-o", bin, src], {
        stdin: "",
        cwd: dir,
        timeoutMs: 10000, // compile gets 10s
        memoryMb: 1024,
      });
      if (!compile.ok) {
        return { ...compile, reason: "compile_error", compileStderr: compile.stderr };
      }
      return await execShellCmd(bin, [], { stdin: req.stdin, cwd: dir, timeoutMs, memoryMb });
    }
    if (req.language === "java") {
      // The harness must define `public class Main` (we enforce in template).
      const src = path.join(dir, "Main.java");
      await fs.writeFile(src, req.source, "utf8");
      const compile = await execShellCmd("javac", [src], {
        stdin: "",
        cwd: dir,
        timeoutMs: 15000,
        memoryMb: 1024,
      });
      if (!compile.ok) {
        return { ...compile, reason: "compile_error", compileStderr: compile.stderr };
      }
      return await execShellCmd("java", ["-Xmx512m", "-cp", dir, "Main"], {
        stdin: req.stdin,
        cwd: dir,
        timeoutMs,
        memoryMb,
      });
    }
    throw new Error(`Unsupported language: ${req.language}`);
  } finally {
    // Cleanup tmpdir async but don't await (best-effort).
    fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Whether the host OS has the required toolchain for a language. */
export async function isLanguageAvailable(lang: SupportedLanguage): Promise<boolean> {
  const probe = await execShellCmd(
    "bash",
    ["-c", lang === "python" ? "python3 --version" : lang === "cpp" ? "g++ --version" : "javac --version"],
    { stdin: "", cwd: tmpdir(), timeoutMs: 3000, memoryMb: 256 },
  );
  return probe.ok;
}
