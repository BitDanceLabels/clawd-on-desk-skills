"use strict";

const childProcess = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const DEFAULT_SERVER_HOST = "server-google-vscode";
const DEFAULT_SERVER_USER = "nhutpm7777";
const DEFAULT_REMOTE_SKILLS_ROOT = "/home/bumbee_workspace/awesome-bumbee-skills/final-skills-mcps";
const DEFAULT_REQUIRED_SKILLS = ["bumbee-system-awareness", "bumbee-encyclopedia"];

function shQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function expandHome(value, homeDir = os.homedir()) {
  if (!value) return "";
  if (value === "~") return homeDir;
  if (value.startsWith("~/")) return path.join(homeDir, value.slice(2));
  return value;
}

function commandOutput(stdout, stderr) {
  return `${stdout || ""}${stderr ? `\n${stderr}` : ""}`.trim();
}

function createBumbeeSystemBootstrap(options = {}) {
  const execFile = options.execFile || childProcess.execFile;
  const logger = typeof options.logger === "function" ? options.logger : () => {};
  const homeDir = options.homeDir || os.homedir();
  const serverHost = options.serverHost || process.env.BUMBEE_SERVER_HOST || DEFAULT_SERVER_HOST;
  const serverUser = options.serverUser || process.env.BUMBEE_SERVER_USER || DEFAULT_SERVER_USER;
  const remoteSkillsRoot = options.remoteSkillsRoot || process.env.BUMBEE_REMOTE_SKILLS_ROOT || DEFAULT_REMOTE_SKILLS_ROOT;
  const sshTarget = `${serverUser}@${serverHost}`;
  const defaultTargets = options.targets || [
    path.join(homeDir, ".codex", "skills"),
    path.join(homeDir, ".claude", "skills"),
  ];
  const defaultSkills = options.skills || DEFAULT_REQUIRED_SKILLS;
  let lastResult = {
    ok: false,
    status: "idle",
    message: "Bumbee system skills have not synced yet.",
    checked_at: null,
    serverHost,
    serverUser,
    remoteSkillsRoot,
    skills: defaultSkills,
    targets: defaultTargets,
    synced: [],
    errors: [],
  };

  function run(command, args, opts = {}) {
    return new Promise((resolve, reject) => {
      execFile(command, args, {
        timeout: opts.timeout || 15000,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      }, (error, stdout, stderr) => {
        const result = {
          command,
          args,
          stdout: stdout || "",
          stderr: stderr || "",
          output: commandOutput(stdout, stderr),
        };
        if (error) {
          error.result = result;
          reject(error);
          return;
        }
        resolve(result);
      });
    });
  }

  function validateSkillName(skill) {
    if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(skill)) {
      throw new Error(`invalid skill name: ${skill}`);
    }
  }

  async function checkRemoteRoot() {
    const command = `test -d ${shQuote(remoteSkillsRoot)} && printf '%s' 'ok'`;
    await run("ssh", ["-o", "BatchMode=yes", "-o", "ConnectTimeout=8", sshTarget, command], { timeout: 12000 });
  }

  async function syncOneSkill(skill, targetDir) {
    validateSkillName(skill);
    const parent = expandHome(targetDir, homeDir);
    const dest = path.join(parent, skill);
    fs.mkdirSync(parent, { recursive: true });
    fs.rmSync(dest, { recursive: true, force: true });
    await run("scp", [
      "-r",
      "-o", "BatchMode=yes",
      "-o", "ConnectTimeout=8",
      `${sshTarget}:${remoteSkillsRoot}/${skill}`,
      parent,
    ], { timeout: 45000 });
    const skillFile = path.join(dest, "SKILL.md");
    if (!fs.existsSync(skillFile)) {
      throw new Error(`sync completed but SKILL.md is missing: ${skillFile}`);
    }
    return { skill, targetDir: parent, path: skillFile };
  }

  async function sync(payload = {}) {
    const skills = Array.isArray(payload.skills) && payload.skills.length ? payload.skills : defaultSkills;
    const targets = Array.isArray(payload.targets) && payload.targets.length ? payload.targets : defaultTargets;
    const started = new Date().toISOString();
    const synced = [];
    const errors = [];

    lastResult = {
      ...lastResult,
      ok: false,
      status: "syncing",
      message: "Syncing Bumbee system skills.",
      checked_at: started,
      skills,
      targets,
      synced,
      errors,
    };

    try {
      await checkRemoteRoot();
    } catch (error) {
      const message = `Cannot reach Bumbee skills root on ${sshTarget}: ${error.result?.output || error.message}`;
      lastResult = {
        ...lastResult,
        ok: false,
        status: "error",
        message,
        errors: [{ stage: "remote-check", message }],
        checked_at: new Date().toISOString(),
      };
      logger(message);
      return lastResult;
    }

    for (const target of targets) {
      for (const skill of skills) {
        try {
          const item = await syncOneSkill(skill, target);
          synced.push(item);
          logger(`Synced ${skill} to ${item.targetDir}`);
        } catch (error) {
          errors.push({
            stage: "skill-sync",
            skill,
            target,
            message: error.result?.output || error.message,
          });
        }
      }
    }

    lastResult = {
      ...lastResult,
      ok: errors.length === 0,
      status: errors.length === 0 ? "ready" : "partial",
      message: errors.length === 0
        ? "Bumbee system skills synced to Codex and Claude."
        : "Bumbee system skills synced with some errors.",
      synced,
      errors,
      checked_at: new Date().toISOString(),
    };
    return lastResult;
  }

  function status() {
    return { ...lastResult };
  }

  return { sync, status, constants: { serverHost, serverUser, remoteSkillsRoot, sshTarget, defaultSkills, defaultTargets } };
}

module.exports = createBumbeeSystemBootstrap;
module.exports.DEFAULT_REQUIRED_SKILLS = DEFAULT_REQUIRED_SKILLS;
