import { normalizeBlockedBy } from "./protocol.js";
//#region src/shared/dependencies.ts
function gateEnabled(settings, gate) {
	return settings?.dependencyGates?.[gate] ?? true;
}
function dependencyState(tasks, task) {
	const byId = new Map(tasks.map((t) => [t.id, t]));
	return (task.blockedBy ?? []).map((id) => {
		const prerequisite = byId.get(id);
		const satisfied = prerequisite !== void 0 && prerequisite.workspaceId === task.workspaceId && prerequisite.trashedAt === void 0 && (prerequisite.status === "in_review" || prerequisite.status === "done");
		return {
			id,
			title: prerequisite?.title ?? id,
			status: prerequisite?.status ?? "missing",
			satisfied
		};
	});
}
function dependencyError(tasks, task) {
	const waiting = dependencyState(tasks, task).filter((d) => !d.satisfied);
	return waiting.length ? `dependency_blocked: ${waiting.map((d) => `${d.title} (${d.id}, ${d.status})`).join(", ")}` : void 0;
}
function validateDependencies(tasks, task, raw = task.blockedBy ?? []) {
	const ids = normalizeBlockedBy(raw);
	const byId = new Map(tasks.map((t) => [t.id, t]));
	byId.set(task.id, {
		...task,
		blockedBy: ids
	});
	for (const id of ids) {
		const prior = byId.get(id);
		if (id === task.id) throw new Error("dependency cannot reference itself");
		if (!prior || prior.trashedAt !== void 0) throw new Error(`dependency not found: ${id}`);
		if (prior.workspaceId !== task.workspaceId) throw new Error(`dependency must belong to the same project: ${id}`);
		const pending = [id];
		const seen = /* @__PURE__ */ new Set();
		while (pending.length) {
			const current = pending.pop();
			if (current === task.id) throw new Error(`dependency cycle involving ${id}`);
			if (seen.has(current)) continue;
			seen.add(current);
			pending.push(...byId.get(current)?.blockedBy ?? []);
		}
	}
	return ids;
}
function referencingTasks(tasks, id) {
	return tasks.filter((t) => t.id !== id && (t.blockedBy ?? []).includes(id));
}
function assertNotReferenced(ledger, id) {
	const refs = referencingTasks(ledger.tasks, id);
	if (refs.length) throw new Error(`task is referenced by: ${refs.map((t) => `${t.title} (${t.id})`).join(", ")}`);
}
//#endregion
export { assertNotReferenced, dependencyError, dependencyState, gateEnabled, referencingTasks, validateDependencies };

//# sourceMappingURL=dependencies.js.map