import { normalizeExternalSource, normalizeExternalSyncRecords } from "../shared/external.js";
import { applyHumanWaitingPatch } from "../shared/human-wait.js";
import { asBoardSettings, emptyLedger, isPlausibleTaskRecord, pruneExecutions } from "../shared/protocol.js";
import { withLedgerWriteLock } from "./ledger-lock.js";
import { mkdir, open, readFile, readdir, rename } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
//#region src/host/store.ts
/**
* Host-side task ledger: one JSON file under the active data directory, mutated through a
* serial write queue, published as immutable snapshots with a global
* monotonic revision. Change subscribers (P2: SSE route) observe every
* committed mutation.
*
* @module dsh-vt-taskboard/host/store
*/
/**
* The durable ledger. All mutations run through {@link mutate}, which:
* validates the resulting document, bumps the global revision, persists
* atomically (temp file + rename), and only then notifies subscribers.
*/
var TaskStore = class TaskStore {
	/** Stores from old and new plugin generations share one write lane per file. */
	static fileQueues = /* @__PURE__ */ new Map();
	file;
	storageQueue;
	ledger = emptyLedger();
	subscribers = /* @__PURE__ */ new Set();
	queue = Promise.resolve();
	loaded = false;
	loadPromise;
	loadFailure;
	hasReadLedger = false;
	/** @param options - file location. */
	constructor(options) {
		this.file = options.file;
		this.storageQueue = options.queue;
	}
	/** Current absolute ledger path. */
	location() {
		return this.file;
	}
	/** A failed load keeps every reader/writer closed until repair and restart. */
	loadError() {
		return this.loadFailure?.message;
	}
	assertReadable() {
		if (this.loadFailure !== void 0) throw this.loadFailure;
	}
	/** Only a successfully loaded ledger may authorize attachment deletion. */
	assetReferences() {
		this.assertReadable();
		if (!this.loaded) throw new Error("taskboard_ledger_unavailable: load the ledger before cleaning attachments");
		return JSON.stringify(this.ledger);
	}
	/** Persist the live in-memory ledger to another file without switching. */
	async writeCopy(file) {
		await this.load();
		await persistAtomic(file, JSON.stringify(this.ledger));
	}
	/** Re-read through the normalizer while holding the cross-instance write lock. */
	async reload() {
		this.loaded = false;
		this.loadPromise = void 0;
		await this.load();
	}
	/** Switch future writes after a prepared migration commits. */
	setLocation(file) {
		this.file = file;
	}
	/** Serialize one operation with every TaskStore in this host for this file. */
	inProcessWriteLane(file, run) {
		const next = (TaskStore.fileQueues.get(file) ?? Promise.resolve()).then(run, run);
		TaskStore.fileQueues.set(file, next);
		next.finally(() => {
			if (TaskStore.fileQueues.get(file) === next) TaskStore.fileQueues.delete(file);
		}).catch(() => {});
		return next;
	}
	/** Load once; only a genuinely new ledger starts empty. Failures retain the original file. */
	load() {
		if (this.loaded) return Promise.resolve();
		if (this.loadPromise !== void 0) return this.loadPromise;
		this.loadPromise = this.loadOnce();
		return this.loadPromise;
	}
	/** Perform the single physical ledger read shared by all startup callers. */
	async loadOnce() {
		try {
			let raw;
			try {
				raw = await readFile(this.file, "utf8");
			} catch (error) {
				if (error.code !== "ENOENT") throw error;
				let entries = [];
				try {
					entries = await readdir(dirname(this.file));
				} catch (scanError) {
					if (scanError.code !== "ENOENT") throw scanError;
				}
				const quarantined = entries.filter((name) => name.startsWith(`${basename(this.file)}.corrupt-`));
				if (quarantined.length > 0) throw new Error(`ledger is missing; recovery files: ${quarantined.map((name) => join(dirname(this.file), name)).join(", ")}`);
				if (this.hasReadLedger) throw new Error("previously loaded ledger is now missing");
				this.ledger = emptyLedger();
				this.loaded = true;
				return;
			}
			const parsed = JSON.parse(raw);
			if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed) || !Number.isSafeInteger(parsed.revision) || parsed.revision < 0 || !Array.isArray(parsed.tasks) || parsed.schemaVersion !== void 0 && parsed.schemaVersion !== 1) throw new Error("invalid ledger structure or unsupported schema version");
			const plausible = [];
			const ids = /* @__PURE__ */ new Set();
			for (const entry of parsed.tasks) {
				if (!isPlausibleTaskRecord(entry)) throw new Error("ledger contains an invalid task record");
				const task = entry;
				if (ids.has(task.id)) throw new Error("ledger contains duplicate task ids");
				ids.add(task.id);
				plausible.push(task);
			}
			const tasks = plausible;
			for (const task of tasks) {
				try {
					applyHumanWaitingPatch(task, task);
				} catch {
					delete task.waitingForHuman;
					delete task.waitingReason;
					console.warn("[dsh-vt-taskboard] dropping invalid human-wait fields on load:", task.id);
				}
				if (task.external !== void 0) {
					const external = normalizeExternalSource(task.external);
					if (external === void 0) delete task.external;
					else task.external = external;
				}
				if (task.status === "in_progress" && task.claimedBy === void 0 && task.updatedBy?.kind === "agent" && typeof task.updatedBy.sessionId === "string") {
					task.claimedBy = task.updatedBy.sessionId;
					task.claimedAt = task.updatedAt;
				}
			}
			let settings = void 0;
			if (parsed.settings !== void 0) try {
				settings = asBoardSettings(parsed.settings);
			} catch {
				console.warn("[dsh-vt-taskboard] dropping invalid board settings on load");
			}
			this.ledger = {
				schemaVersion: 1,
				revision: parsed.revision,
				tasks,
				...parsed.externalSync !== void 0 ? { externalSync: normalizeExternalSyncRecords(parsed.externalSync) } : {},
				...settings !== void 0 ? { settings } : {}
			};
			this.hasReadLedger = true;
			this.loaded = true;
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			this.loadFailure = new Error(`taskboard_ledger_unavailable: cannot load ${this.file}: ${reason}. Original files retained; writes and attachment cleanup are blocked. Repair or restore the ledger at this path, then restart DSH.`, { cause: error });
			console.warn("[dsh-vt-taskboard] ledger load failed; recovery required:", this.loadFailure.message, error);
			throw this.loadFailure;
		}
	}
	/**
	* The current snapshot — a deep-frozen clone. Mutating the returned value
	* throws (strict mode) instead of silently bypassing the revision/persist
	* path; internal state is never handed out.
	*/
	snapshot() {
		this.assertReadable();
		return deepFreeze(structuredClone(this.ledger));
	}
	/** Find a task by id (frozen clone; internal state is never handed out). */
	get(id) {
		this.assertReadable();
		const task = this.ledger.tasks.find((t) => t.id === id);
		return task === void 0 ? void 0 : deepFreeze(structuredClone(task));
	}
	/** Subscribe to committed changes; returns the unsubscribe. */
	subscribe(fn) {
		this.subscribers.add(fn);
		return () => this.subscribers.delete(fn);
	}
	/**
	* Write a timestamped backup copy of the current ledger next to the live
	* file (import-replace safety, 0.4.0). Never throws the caller's flow —
	* a backup failure fails the import itself.
	* @returns the backup file path.
	*/
	async backup() {
		const run = async () => {
			await this.load();
			const target = `${this.file}.backup-${Date.now()}`;
			await persistAtomic(target, JSON.stringify(this.ledger, null, 2));
			return target;
		};
		return this.storageQueue === void 0 ? run() : this.storageQueue.run(run);
	}
	/**
	* Run one mutation inside the serial queue. The mutator works on a
	* structured clone; returning `undefined` aborts with no write.
	* @param kind - change kind for subscribers.
	* @param mutator - receives the cloned ledger; mutate tasks in place; return the touched tasks.
	*/
	async mutate(kind, mutator) {
		const run = async () => {
			await this.load();
			const file = this.file;
			return this.inProcessWriteLane(file, async () => withLedgerWriteLock(file, async () => {
				await this.reload();
				const draft = structuredClone(this.ledger);
				const changed = mutator(draft);
				if (changed === void 0) return {
					ledger: deepFreeze(structuredClone(this.ledger)),
					changed: []
				};
				for (const task of changed) pruneExecutions(task);
				draft.revision += 1;
				await persistAtomic(file, JSON.stringify(draft));
				this.hasReadLedger = true;
				this.ledger = draft;
				const change = {
					revision: draft.revision,
					tasks: changed,
					kind
				};
				for (const fn of this.subscribers) try {
					fn(change);
				} catch {}
				return {
					ledger: deepFreeze(structuredClone(draft)),
					changed: changed.map((t) => deepFreeze(structuredClone(t)))
				};
			}));
		};
		if (this.storageQueue !== void 0) return this.storageQueue.run(run);
		return this.queue = this.queue.then(run, run);
	}
	/**
	* Run a read INSIDE the serial queue (R3): observes exactly the ledger
	* state after all previously enqueued mutations — immune to the
	* write-then-publish window around `mutate`'s persistence. Read-only: the
	* callback receives a frozen deep clone and nothing is written.
	*/
	async read(fn) {
		const run = async () => {
			await this.load();
			return fn(deepFreeze(structuredClone(this.ledger)));
		};
		if (this.storageQueue !== void 0) return this.storageQueue.run(run);
		return this.queue = this.queue.then(run, run);
	}
};
/** Recursively freeze a plain-data value (defense in depth for handed-out snapshots). */
function deepFreeze(value) {
	if (value !== null && typeof value === "object") {
		if (!Object.isFrozen(value)) Object.freeze(value);
		for (const key of Object.keys(value)) deepFreeze(value[key]);
	}
	return value;
}
/**
* Atomic file persist: write temp, fsync, then rename over the target (S10:
* without the sync, a power loss after rename can leave a zero-length file —
* the next load would refuse the damaged ledger).
*/
async function persistAtomic(file, contents) {
	await mkdir(dirname(file), { recursive: true });
	const temp = join(dirname(file), `.${Math.random().toString(36).slice(2)}.tmp`);
	const fh = await open(temp, "w");
	try {
		await fh.writeFile(contents, "utf8");
		await fh.sync();
	} finally {
		await fh.close();
	}
	await rename(temp, file);
}
//#endregion
export { TaskStore };

//# sourceMappingURL=store.js.map