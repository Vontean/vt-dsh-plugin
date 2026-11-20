import { isValidRelRepoPath } from "../shared/protocol.js";
import { statusLineUnder, worktreePathOf, worktreeStatusError } from "./git.js";
import { lstat, readdir, rmdir } from "node:fs/promises";
//#region src/host/isolation.ts
/**
* Worktree isolation orchestration (0.6.3): turns the single-repo worktree
* flow into a whole-workspace MIRROR when a workspace holds parallel git
* repositories — the workspace root repo plus its nested ones (plan §3/§4).
*
* Responsibilities (git.ts stays the narrow per-repo face):
* - prepareMirror: discover the repos, prepare one worktree per repo under
*   the task mirror directory (root repo at the mirror root, each nested
*   repo at its relative path), with per-repo reuse (续跑) and a bounded
*   partial-failure policy: the FIRST repo failing degrades the whole run
*   to the original directory (legacy semantics), a later repo failing
*   just drops it from the mirror (framing marks it 禁改 — the isolation
*   boundary never blurs).
* - removeMirror: children-first removal with an aggregated dirty
*   pre-check (one dirty repo refuses the WHOLE mirror before anything is
*   deleted). Children must go first: a nested worktree under the root
*   worktree reads as untracked noise there, so the root worktree is only
*   removable once they are gone.
*
* Preparation stays fail-soft at the execution boundary. Destructive removal
* refuses unknown status and propagates errors to the user action.
*
* @module dsh-vt-taskboard/host/isolation
*/
/** Whether this mirror is exactly the legacy single-repo shape. */
function isLegacySingle(mirror) {
	return mirror.repos.length === 1 && mirror.repos[0].repo === "" && mirror.skipped.length === 0;
}
/** Whether a repo key may ride into a mirror path (defense in depth under worktreePathOf). */
function assertRepoKey(repo) {
	if (!isValidRelRepoPath(repo)) throw new Error("Error: invalid_input: illegal repo path " + JSON.stringify(repo.slice(0, 80)));
}
/** Join a repo relative path under a base path (forward slashes). */
function under(base, rel) {
	return rel === "" ? base : base + "/" + rel;
}
/** Unlike preparation's fail-soft probe, deletion may only ignore ENOENT. */
async function removalPathExists(path) {
	try {
		const info = await lstat(path);
		if (!info.isDirectory() || info.isSymbolicLink()) throw worktreeStatusError(path);
		return true;
	} catch (error) {
		if (error.code === "ENOENT") return false;
		throw worktreeStatusError(path, error);
	}
}
/** A non-git mirror root is removable only when it contains checked children
* and empty container directories. Files, .git markers, and symlinks refuse. */
async function assertPlainContainer(path, children, rel = "") {
	for (const entry of await readdir(path, { withFileTypes: true })) {
		if (!entry.isDirectory() || entry.isSymbolicLink() || entry.name === ".git") throw worktreeStatusError(path);
		const childRel = rel.length === 0 ? entry.name : rel + "/" + entry.name;
		if (!children.includes(childRel)) await assertPlainContainer(under(path, entry.name), children, childRel);
	}
}
/** Git removes registered worktrees. Leftover containers may lose empty
* directories only; never recursively unlink files after a status check. */
async function removeEmptyContainers(root) {
	const directories = [];
	const inspect = async (path) => {
		if (!await removalPathExists(path)) return;
		for (const entry of await readdir(path, { withFileTypes: true })) {
			if (!entry.isDirectory() || entry.isSymbolicLink()) throw worktreeStatusError(path);
			await inspect(under(path, entry.name));
		}
		directories.push(path);
	};
	try {
		await inspect(root);
		for (const path of directories) try {
			await rmdir(path);
		} catch (error) {
			if (error.code !== "ENOENT") throw error;
		}
	} catch (error) {
		throw worktreeStatusError(root, error);
	}
}
/**
* Prepare the task mirror across every repo of the workspace.
*
* Repo list: the workspace root repo (GitFace.detect decides, whatever its
* .git shape) leads, nested parallel repos follow in path order. Each repo
* gets its own worktree on its pinned branch (or the shared default); reuse keeps live
* worktrees as-is per repo (续跑), falling back to a fresh preparation per
* repo — and a stale blocking directory gets one forced-fresh retry.
*/
async function prepareMirror(deps, args) {
	const { git, scanner } = deps;
	const repos = [];
	let inside = false;
	try {
		inside = await git.detect(args.workspacePath);
	} catch {}
	if (inside) repos.push({
		relPath: "",
		absPath: args.workspacePath
	});
	let nested = [];
	try {
		nested = await scanner.findNestedRepos(args.workspacePath);
	} catch {
		nested = [];
	}
	for (const repo of nested) {
		assertRepoKey(repo.relPath);
		repos.push(repo);
	}
	if (repos.length === 0) {
		let hasBinary = true;
		try {
			hasBinary = await git.binaryAvailable();
		} catch {}
		return { note: hasBinary ? "当前项目不是 git 仓库，已在原目录执行" : "git 不可用（未安装或不在 PATH），已在原目录执行" };
	}
	if (repos.length > 8) return { note: "工作区内 git 仓库数超过镜像上限（" + repos.length + " > 8），已在原目录执行" };
	const mirrorRoot = worktreePathOf(args.workspacePath, args.taskId);
	const prepared = [];
	const skipped = [];
	for (let i = 0; i < repos.length; i++) {
		const repo = repos[i];
		const target = under(mirrorRoot, repo.relPath);
		const branch = repo.relPath === "" ? args.branch : args.branches?.[repo.relPath] ?? args.branch;
		let info;
		try {
			info = await git.prepareWorktree(repo.absPath, target, branch, args.reuse ? "reuse" : "fresh");
		} catch {}
		if (info === void 0 && args.reuse) try {
			info = await git.prepareWorktree(repo.absPath, target, branch, "fresh");
		} catch {}
		if (info === void 0) {
			if (i === 0) return { note: "worktree 准备失败（git 报错或目录被占用），已在原目录执行" };
			skipped.push({
				repo: repo.relPath,
				reason: "worktree 准备失败"
			});
			continue;
		}
		prepared.push({
			repo: repo.relPath,
			branch: info.branch,
			worktreePath: info.path,
			baseCommit: info.baseCommit,
			...info.reused === true ? { reused: true } : {}
		});
	}
	return { mirror: {
		root: mirrorRoot,
		repos: prepared,
		skipped,
		allReused: prepared.length > 0 && prepared.every((p) => p.reused === true)
	} };
}
/**
* Remove a task whole mirror: aggregate the dirty pre-check across EVERY
* repo worktree first (one dirty repo refuses everything, nothing is
* deleted), then remove children before the root (see module doc).
* Unknown status refuses deletion; a plain root container must contain only
* verified children. After git removal, only empty directories are cleaned.
* @throws with code dirty-mirror when any repo worktree holds uncommitted changes.
*/
async function removeMirror(deps, args) {
	const { git, scanner } = deps;
	const mirrorRoot = worktreePathOf(args.workspacePath, args.taskId);
	scanner.clearCache();
	let nested = [];
	try {
		nested = await scanner.findNestedRepos(args.workspacePath);
	} catch (error) {
		throw worktreeStatusError(mirrorRoot, error);
	}
	const targets = [];
	for (const repo of nested) {
		assertRepoKey(repo.relPath);
		const path = under(mirrorRoot, repo.relPath);
		if (await removalPathExists(path)) targets.push({
			repo: repo.relPath,
			repoRoot: repo.absPath,
			path
		});
	}
	targets.push({
		repo: "",
		repoRoot: args.workspacePath,
		path: mirrorRoot
	});
	const childRels = targets.filter((t) => t.repo !== "").map((t) => t.repo);
	const dirty = [];
	const skipGit = /* @__PURE__ */ new Set();
	for (const target of targets) {
		const raw = await git.dirtyLines(target.path).catch(() => void 0);
		if (raw === void 0) {
			if (!await removalPathExists(target.path)) {
				skipGit.add(target.path);
				continue;
			}
			if (target.repo !== "") throw worktreeStatusError(target.path);
			try {
				await assertPlainContainer(target.path, childRels);
			} catch (error) {
				throw worktreeStatusError(target.path, error);
			}
			skipGit.add(target.path);
			continue;
		}
		const lines = target.repo === "" && raw !== void 0 ? raw.filter((l) => !statusLineUnder(l, childRels)) : raw;
		if (lines !== void 0 && lines.length > 0) dirty.push({
			repo: target.repo,
			lines
		});
	}
	if (dirty.length > 0) {
		const detail = dirty.map((d) => (d.repo === "" ? "根仓库" : d.repo) + "：\n" + d.lines.slice(0, 10).join("\n")).join("\n");
		throw Object.assign(/* @__PURE__ */ new Error("镜像中 " + dirty.length + " 个仓库有未提交修改，拒绝删除：\n" + detail), { code: "dirty-mirror" });
	}
	for (const target of targets) {
		if (skipGit.has(target.path) && target.repo === "") continue;
		try {
			if (!skipGit.has(target.path)) await git.removeWorktree(target.repoRoot, target.path, target.repo === "" ? {
				exempt: childRels,
				force: true
			} : void 0);
			if (target.repo !== "") await removeEmptyContainers(target.path);
		} catch (error) {
			throw new Error("删除镜像失败：" + (target.repo === "" ? "根仓库" : target.repo) + "：" + (error instanceof Error ? error.message : String(error)), { cause: error });
		}
	}
	await removeEmptyContainers(mirrorRoot);
}
/**
* Absolute path of a repo main checkout inside the workspace (the fallback
* cwd for diff views after a mirror is gone).
*/
function repoMainPath(workspacePath, repo) {
	assertRepoKey(repo);
	return under(workspacePath, repo);
}
//#endregion
export { isLegacySingle, prepareMirror, removeMirror, repoMainPath };

//# sourceMappingURL=isolation.js.map