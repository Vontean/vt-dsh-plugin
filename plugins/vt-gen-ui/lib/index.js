import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomUUID } from "node:crypto";
// src/client/genui-runtime/schema.ts
/** Canonical enum domains shared by schema validation and repair. */
const TEXT_SIZES = [
	"display",
	"h1",
	"h2",
	"h3",
	"body",
	"muted",
	"caption"
];
const TEXT_ALIGNS = [
	"left",
	"center",
	"right"
];
const BUTTON_TONES = [
	"primary",
	"danger",
	"success",
	"ghost"
];
const BADGE_TONES = [
	"success",
	"warn",
	"danger",
	"accent"
];
const INPUT_TYPES = [
	"text",
	"email",
	"password",
	"color"
];
const CALLOUT_TONES = [
	"info",
	"success",
	"warning",
	"error"
];
const CHART_KINDS = [
	"bars",
	"line",
	"donut"
];
const PLOT_KINDS = [
	"line",
	"area",
	"scatter"
];
const MEDIA_ASPECT_RATIOS = [
	"16:9",
	"4:3",
	"1:1",
	"9:16"
];
const MESH_SHAPES = [
	"box",
	"sphere",
	"cone",
	"cylinder",
	"torus"
];
const FILE_TYPES = ["file", "dir"];
const DIAGRAM_KINDS = [
	"architecture",
	"it-state",
	"flowchart",
	"sequence",
	"state",
	"er",
	"timeline",
	"swimlane",
	"quadrant",
	"radar",
	"loop",
	"nested",
	"tree",
	"org-chart",
	"layers",
	"venn",
	"pyramid",
	"bar",
	"line",
	"gantt",
	"scatter",
	"high-level",
	"process",
	"medallion",
	"data-flow",
	"dp-integration",
	"dp-security-matrix"
];
const DIAGRAM_NODE_TYPES = [
	"focal",
	"backend",
	"store",
	"external",
	"input",
	"optional",
	"security"
];
const DIAGRAM_VARIANTS = [
	"light",
	"dark",
	"editorial"
];
const DIAGRAM_EDGE_KINDS = [
	"solid",
	"dashed",
	"accent",
	"link"
];
const DIAGRAM_ROUTES = [
	"auto",
	"orthogonal",
	"straight"
];
const ECHART_PRESETS = [
	"bar",
	"line",
	"area",
	"pie",
	"scatter",
	"radar",
	"gauge",
	"funnel",
	"treemap",
	"sankey",
	"graph",
	"heatmap",
	"bigline",
	"wordCloud"
];
/** Oversized single-number stat (one per fence as the visual anchor). */
const STAT_SIZES = ["hero"];
/** Progress shapes: a track (default) or a circular gauge. */
const PROGRESS_VARIANTS = ["bar", "ring"];
/** Semantic card surfaces. */
const CARD_TONES = [
	"info",
	"success",
	"warning",
	"danger"
];
/** Text run tones (semantic colour without a badge). */
const TEXT_TONES = [
	"danger",
	"success",
	"warning",
	"info",
	"muted"
];
/** Arrow directions. */
const ARROW_DIRS = ["down", "right"];
/** Row main-axis alignment values. */
const ROW_JUSTIFY = [
	"start",
	"center",
	"end",
	"between"
];
/** Block-row paint modes: filled cells, or outlined cells for bit grids. */
const BLOCKS_VARIANTS = [
	"fill",
	"outline",
	"plain"
];
/** 单格强调的语义档位。 */
const BLOCK_CELL_TONES = [
	"accent",
	"success",
	"warning",
	"danger",
	"muted"
];
/** Icon tones: the four semantic roles plus neutral/muted text colours. */
const ICON_TONES = [
	"default",
	"muted",
	"info",
	"success",
	"warning",
	"danger"
];
/** Hero cover tones. */
const HERO_TONES = [
	"accent",
	"success",
	"warning",
	"danger"
];
/** Table cell renderers (`table.types`, one entry per column). */
const TABLE_CELL_TYPES = [
	"text",
	"num",
	"delta",
	"bar",
	"badge",
	"spark",
	"ring",
	"index",
	"group"
];
const schema = (required, fields, aliases = {}, options = {}) => {
	const optional = Object.fromEntries(Object.entries(fields).filter(([field]) => field !== "type" && !required.includes(field)));
	const oneOfRequired = options.oneOfRequired ?? [];
	const conditionalRequired = options.conditionalRequired ?? [];
	const rules = [...oneOfRequired.map((fieldsInRule) => ({
		kind: "one-of-required",
		fields: fieldsInRule
	})), ...conditionalRequired];
	return {
		required,
		fields,
		optional,
		aliases,
		valueAliases: options.valueAliases ?? {},
		oneOfRequired,
		conditionalRequired,
		rules,
		enums: options.enums ?? {},
		nested: options.nested ?? {},
		...options.validator === void 0 ? {} : { validator: options.validator }
	};
};
const recordSchema = (required, fields, nested = {}, enums = {}, aliases = {}) => ({
	required,
	fields,
	enums,
	nested,
	aliases
});
const nodeFields = {
	type: "string",
	span: "number"
};
const chartDatumSchema = recordSchema(["label", "value"], {
	label: "string",
	value: "number",
	color: "string"
});
const chartSeriesSchema = recordSchema(["label", "data"], {
	label: "string",
	color: "string",
	data: "array"
}, { data: chartDatumSchema });
const stepsRecordSchema = recordSchema(["title"], {
	title: "string",
	desc: "string"
});
const keyValueRecordSchema = recordSchema(["key", "value"], {
	key: "string",
	value: "string"
}, {}, {}, { label: "key" });
const timelineRecordSchema = recordSchema(["title"], {
	title: "string",
	desc: "string",
	time: "string"
});
const blocksRowSchema = recordSchema(["cells"], {
	label: "string",
	cells: "array",
	color: "string",
	variant: "string"
}, {}, { variant: BLOCKS_VARIANTS }, { title: "label" });
const diffRecordSchema = recordSchema(["path", "newText"], {
	path: "string",
	oldText: "string-or-null",
	newText: "string"
});
const plotSeriesSchema = recordSchema(["expr"], {
	expr: "string",
	label: "string",
	color: "string",
	kind: "string",
	params: "array"
}, { params: recordSchema(["name", "value"], {
	name: "string",
	value: "number",
	min: "number",
	max: "number",
	step: "number",
	animateTo: "number",
	durationMs: "number",
	loop: "boolean"
}) }, { kind: PLOT_KINDS });
const sceneMeshSchema = recordSchema(["shape"], {
	shape: "string",
	color: "string",
	position: "array",
	rotation: "array",
	scale: "unknown",
	size: "unknown"
}, {}, { shape: MESH_SHAPES });
function fileTreeRecordSchema(depth) {
	return recordSchema(["name"], {
		name: "string",
		type: "string",
		children: "array"
	}, depth > 0 ? { children: fileTreeRecordSchema(depth - 1) } : {}, { type: FILE_TYPES }, { label: "name" });
}
const fileTreeNodeSchema = fileTreeRecordSchema(6);
const tabHolderSchema = recordSchema(["label", "items"], {
	label: "string",
	items: "nodes",
	content: "nodes"
});
const accordionHolderSchema = recordSchema(["title", "items"], {
	title: "string",
	items: "nodes"
});
const diagramNodeSchema = recordSchema(["id", "label"], {
	id: "string",
	label: "string",
	sub: "string",
	type: "string",
	x: "number",
	y: "number",
	w: "number",
	h: "number",
	tag: "string"
}, {}, { type: DIAGRAM_NODE_TYPES });
const diagramEdgeSchema = recordSchema(["from", "to"], {
	from: "string",
	to: "string",
	label: "string",
	kind: "string",
	route: "string"
}, {}, {
	kind: DIAGRAM_EDGE_KINDS,
	route: DIAGRAM_ROUTES
});
const diagramZoneSchema = recordSchema(["label"], {
	label: "string",
	x: "number",
	y: "number",
	w: "number",
	h: "number"
});
const diagramThemeSchema = recordSchema([], {
	paper: "string",
	"paper-2": "string",
	ink: "string",
	muted: "string",
	soft: "string",
	rule: "string",
	accent: "string",
	"accent-tint": "string",
	link: "string"
});
/** Root GenUI specification metadata used by diagnostics. */
const GENUI_SPEC_SCHEMA = schema(["items"], {
	title: "string",
	gap: "number",
	panel: "boolean",
	append: "boolean",
	items: "nodes"
});
/**
* Native component field metadata.
*
* This is intentionally explicit rather than inferred from TypeScript
* interfaces: the registry is also consumed at runtime by normalization and
* diagnostics, where erased interfaces are unavailable.
*/
const COMPONENT_SCHEMAS = {
	arrow: schema([], {
		...nodeFields,
		dir: "string",
		length: "number",
		label: "string"
	}, { direction: "dir" }, { enums: { dir: ARROW_DIRS } }),
	accordion: schema(["items"], {
		...nodeFields,
		items: "array"
	}, {}, { nested: { items: accordionHolderSchema } }),
	audio: schema(["src"], {
		...nodeFields,
		src: "string",
		alt: "string",
		loop: "boolean"
	}, {
		url: "src",
		link: "src"
	}),
	avatar: schema(["name"], {
		...nodeFields,
		name: "string",
		color: "string"
	}),
	badge: schema(["label"], {
		...nodeFields,
		label: "string",
		tone: "string",
		icon: "string"
	}, {
		text: "label",
		value: "label"
	}, { enums: { tone: BADGE_TONES } }),
	breadcrumb: schema(["items"], {
		...nodeFields,
		items: "array"
	}),
	button: schema(["label"], {
		...nodeFields,
		label: "string",
		tone: "string",
		full: "boolean",
		small: "boolean",
		icon: "string",
		action: "string"
	}, {}, { enums: { tone: BUTTON_TONES } }),
	callout: schema(["content"], {
		...nodeFields,
		title: "string",
		content: "string",
		tone: "string"
	}, {
		kind: "tone",
		text: "content",
		body: "content",
		desc: "content"
	}, {
		enums: { tone: CALLOUT_TONES },
		valueAliases: { tone: {
			danger: "error",
			warn: "warning"
		} }
	}),
	card: schema(["items"], {
		...nodeFields,
		title: "string",
		eyebrow: "string",
		items: "nodes",
		tone: "string",
		accent: "string",
		flat: "boolean"
	}, {
		label: "title",
		content: "items"
	}, { enums: { tone: CARD_TONES } }),
	chart: schema([], {
		...nodeFields,
		title: "string",
		kind: "string",
		data: "array",
		series: "array",
		horizontal: "boolean",
		stacked: "boolean",
		filter: "string",
		palette: "array"
	}, {}, {
		oneOfRequired: [["data", "series"]],
		conditionalRequired: [{
			kind: "required-if",
			when: {
				field: "kind",
				equals: "donut"
			},
			required: ["data"]
		}],
		nested: {
			data: chartDatumSchema,
			series: chartSeriesSchema
		},
		enums: { kind: CHART_KINDS },
		validator: { name: "chart-renderability" }
	}),
	checkbox: schema(["label"], {
		...nodeFields,
		label: "string",
		checked: "boolean",
		action: "string",
		group: "string"
	}),
	code: schema(["code"], {
		...nodeFields,
		lang: "string",
		code: "string"
	}, {
		content: "code",
		text: "code"
	}),
	col: schema(["items"], {
		...nodeFields,
		items: "nodes",
		gap: "number",
		width: "number"
	}),
	copy: schema(["text"], {
		...nodeFields,
		label: "string",
		text: "string",
		expandable: "boolean",
		previewLines: "number"
	}, {
		content: "text",
		code: "text",
		value: "text"
	}),
	diagram: schema(["kind", "nodes"], {
		...nodeFields,
		kind: "string",
		variant: "string",
		title: "string",
		nodes: "array",
		edges: "array",
		zones: "array",
		theme: "object"
	}, {}, {
		nested: {
			nodes: diagramNodeSchema,
			edges: diagramEdgeSchema,
			zones: diagramZoneSchema,
			theme: diagramThemeSchema
		},
		enums: {
			kind: DIAGRAM_KINDS,
			variant: DIAGRAM_VARIANTS
		}
	}),
	diff: schema(["diffs"], {
		...nodeFields,
		diffs: "array"
	}, {
		items: "diffs",
		files: "diffs"
	}, { nested: { diffs: diffRecordSchema } }),
	divider: schema([], {
		...nodeFields,
		label: "string"
	}, {
		title: "label",
		text: "label"
	}),
	echart: schema([], {
		...nodeFields,
		title: "string",
		height: "number",
		preset: "string",
		data: "array",
		series: "array",
		links: "array",
		palette: "array",
		option: "object"
	}, {}, {
		oneOfRequired: [[
			"option",
			"data",
			"series",
			"links"
		]],
		enums: { preset: ECHART_PRESETS }
	}),
	"file-tree": schema(["items"], {
		...nodeFields,
		items: "array"
	}, { nodes: "items" }, { nested: { items: fileTreeNodeSchema } }),
	grid: schema(["items"], {
		...nodeFields,
		cols: "number",
		items: "nodes"
	}),
	blocks: schema(["rows"], {
		...nodeFields,
		rows: "array",
		columns: "number",
		caption: "string",
		title: "string"
	}, {
		items: "rows",
		data: "rows"
	}, { nested: { rows: blocksRowSchema } }),
	icon: schema(["name"], {
		...nodeFields,
		name: "string",
		label: "string",
		tone: "string",
		size: "number",
		tile: "boolean"
	}, { icon: "name" }, { enums: { tone: ICON_TONES } }),
	image: schema(["src"], {
		...nodeFields,
		src: "string",
		alt: "string",
		caption: "string"
	}, {
		url: "src",
		link: "src"
	}),
	input: schema([], {
		...nodeFields,
		label: "string",
		placeholder: "string",
		value: "string",
		inputType: "string",
		action: "string",
		id: "string"
	}, {}, { enums: { inputType: INPUT_TYPES } }),
	json: schema(["value"], {
		...nodeFields,
		value: "unknown"
	}),
	keyvalue: schema(["pairs"], {
		...nodeFields,
		pairs: "array"
	}, {
		items: "pairs",
		rows: "pairs",
		entries: "pairs"
	}, { nested: { pairs: keyValueRecordSchema } }),
	link: schema(["label"], {
		...nodeFields,
		label: "string",
		href: "string"
	}),
	list: schema(["items"], {
		...nodeFields,
		items: "array",
		filter: "string"
	}),
	mermaid: schema(["code"], {
		...nodeFields,
		code: "string"
	}),
	svg: schema(["code"], {
		...nodeFields,
		code: "string",
		title: "string",
		height: "number"
	}),
	plot: schema(["series"], {
		...nodeFields,
		series: "array",
		xMin: "number",
		xMax: "number",
		yMin: "number",
		yMax: "number",
		title: "string"
	}, {}, { nested: { series: plotSeriesSchema } }),
	progress: schema(["value"], {
		...nodeFields,
		value: "number",
		label: "string",
		valueLabel: "string",
		variant: "string",
		target: "number"
	}, {}, { enums: { variant: PROGRESS_VARIANTS } }),
	quiz: schema(["question", "options"], {
		...nodeFields,
		question: "string",
		options: "array",
		explanation: "string",
		id: "string",
		action: "string"
	}, {
		title: "question",
		text: "question",
		choices: "options",
		items: "options"
	}),
	radio: schema(["options"], {
		...nodeFields,
		label: "string",
		options: "array",
		selected: "number",
		action: "string",
		group: "string",
		answer: "unknown",
		explanation: "string"
	}, { items: "options" }),
	row: schema(["items"], {
		...nodeFields,
		items: "nodes",
		wrap: "boolean",
		spacer: "boolean",
		justify: "string"
	}, {}, { enums: { justify: ROW_JUSTIFY } }),
	scene3d: schema(["meshes"], {
		...nodeFields,
		title: "string",
		meshes: "array",
		ambient: "number",
		background: "string"
	}, {}, { nested: { meshes: sceneMeshSchema } }),
	select: schema(["options"], {
		...nodeFields,
		label: "string",
		options: "array",
		action: "string",
		selected: "number",
		id: "string"
	}, { items: "options" }),
	slider: schema([], {
		...nodeFields,
		label: "string",
		min: "number",
		max: "number",
		step: "number",
		value: "number",
		action: "string",
		id: "string"
	}),
	spacer: schema([], nodeFields),
	hero: schema(["title"], {
		...nodeFields,
		title: "string",
		subtitle: "string",
		value: "string",
		label: "string",
		delta: "string",
		spark: "array",
		tone: "string"
	}, {}, { enums: { tone: HERO_TONES } }),
	stat: schema(["label", "value"], {
		...nodeFields,
		label: "string",
		value: "string",
		delta: "string",
		spark: "array",
		size: "string"
	}, {}, { enums: { size: STAT_SIZES } }),
	steps: schema(["steps"], {
		...nodeFields,
		steps: "array",
		current: "number"
	}, { items: "steps" }, { nested: { steps: stepsRecordSchema } }),
	submit: schema(["label"], {
		...nodeFields,
		label: "string",
		action: "string",
		resetAction: "string",
		groups: "array"
	}),
	switch: schema(["label"], {
		...nodeFields,
		label: "string",
		checked: "boolean",
		action: "string"
	}),
	table: schema(["columns", "rows"], {
		...nodeFields,
		columns: "array",
		rows: "array",
		types: "array",
		total: "boolean",
		details: "array",
		filter: "string",
		filterColumn: "number",
		sortField: "string",
		export: "boolean"
	}, {
		headers: "columns",
		data: "rows",
		items: "rows"
	}),
	tabs: schema(["tabs"], {
		...nodeFields,
		tabs: "array"
	}, {}, { nested: { tabs: tabHolderSchema } }),
	text: schema(["content"], {
		...nodeFields,
		content: "string",
		size: "string",
		center: "boolean",
		align: "string",
		tone: "string",
		mono: "boolean"
	}, { text: "content" }, { enums: {
		size: TEXT_SIZES,
		align: TEXT_ALIGNS,
		tone: TEXT_TONES
	} }),
	textarea: schema([], {
		...nodeFields,
		label: "string",
		placeholder: "string",
		rows: "number",
		value: "string",
		action: "string",
		id: "string"
	}),
	timeline: schema(["items"], {
		...nodeFields,
		items: "array"
	}, {}, { nested: { items: timelineRecordSchema } }),
	video: schema(["src"], {
		...nodeFields,
		src: "string",
		alt: "string",
		poster: "string",
		loop: "boolean",
		muted: "boolean",
		aspectRatio: "string"
	}, {
		url: "src",
		link: "src"
	}, { enums: { aspectRatio: MEDIA_ASPECT_RATIOS } })
};
const GENUI_NATIVE_TYPES = new Set(Object.keys(COMPONENT_SCHEMAS));
// src/client/spec.ts
/**
* GenUI spec language: the declarative component tree a model emits inside a
* ```dsh-ui fence in its reply, which GenuiBlock renders as real interactive
* UI inline in the conversation. The vocabulary is a white list — the renderer
* maps each node to DOM directly, with no arbitrary-HTML path (same
* untrusted-output stance as MarkdownText).
*
* v1 interactivity is client-side only: buttons, tabs, checkboxes, and inputs
* are operable, but events do NOT flow back to the model.
*/
/**
* Is `value` a bare component root rather than an envelope spec?
*
* A root object carrying a `type` is the documented single-component
* shorthand. `items` alone cannot decide the root shape: for container
* components it holds children (row/col/grid/card/accordion) and for data
* components it holds records (steps/list/timeline/file-tree/breadcrumb), so
* both readings are components. A whitelisted `type` therefore wins over the
* envelope reading — `{"type":"steps","items":[{"title":"…"}]}` is a bare
* steps node, never a spec whose `items` are the step records (issue #172).
* A non-native `type` keeps the envelope reading, so a stray `type` field
* (`{"type":"genui","items":[…]}`) cannot swallow a real spec root.
*/
function isComponentRoot(value) {
	if (typeof value !== "object" || value === null) return false;
	const v = value;
	if (typeof v.type !== "string" || v.type === "") return false;
	if (!Array.isArray(v.items)) return true;
	return GENUI_NATIVE_TYPES.has(v.type);
}
/**
* Wrap a bare component object into a one-item spec. Returns null when
* `value` is not component-shaped (no usable `type`). Root-level spec fields
* found on the component are hoisted onto the wrapper: `panel`/`append` (so
* panel routing keeps working) and `title` when the component has no title of
* its own (`{"type":"steps","title":"…"}` means a titled block, not a steps
* field the schema would drop).
*
* The wrapper is a plain spec rather than a `col` node: a spec root is
* already rendered as a column by GenuiBlock, and leaving the wrapper free of
* a component `type` is what stops the guard from reading it as one more bare
* component root and nesting every fence inside a second column (issue #172).
*/
function wrapSingleComponentRoot(value) {
	if (typeof value !== "object" || value === null) return null;
	const v = value;
	if (typeof v.type !== "string" || v.type === "") return null;
	const definition = GENUI_NATIVE_TYPES.has(v.type) ? COMPONENT_SCHEMAS[v.type] : void 0;
	const title = typeof v.title === "string" && definition !== void 0 && !("title" in definition.fields) ? v.title : void 0;
	const node = { ...value };
	if (title !== void 0) delete node.title;
	return {
		items: [node],
		...title !== void 0 ? { title } : {},
		...v.panel === true ? { panel: true } : {},
		...v.append === true ? { append: true } : {}
	};
}
/**
* Basic structural guard: is this object a valid GenuiSpec?
*
* A bare component root is not a spec (it is wrapped instead), so
* `{"type":"steps","items":[…]}` answers false and `parseGenuiSpec` routes it
* through `wrapSingleComponentRoot` (issue #172).
*/
function isGenuiSpec(value) {
	if (typeof value !== "object" || value === null) return false;
	if (isComponentRoot(value)) return false;
	const v = value;
	if (!Array.isArray(v.items)) return false;
	if (v.title !== void 0 && typeof v.title !== "string") return false;
	if (v.gap !== void 0 && typeof v.gap !== "number") return false;
	return true;
}
// src/client/genui-runtime/limits.ts
/** Resource limits shared by GenUI repair, validation, and rendering. */
const GENUI_LIMITS = {
	/** Maximum nesting depth of the component tree. */
	maxDepth: 8,
	/** Maximum total nodes across the whole spec. */
	maxNodes: 200,
	/** Maximum length of any plain string field. */
	maxString: 2e3,
	/** Maximum length of a `code` body. */
	maxCode: 12e3,
	/** Copy preview only; clipboard text keeps the existing maxCode limit. */
	maxCopyPreview: 2e3,
	maxCopyPreviewLines: 30,
	/** Maximum length of a mermaid source. */
	maxMermaid: 8e3,
	/** Maximum `grid` columns. */
	maxGridCols: 12,
	/** Maximum `tabs` count. */
	maxTabs: 12,
	/** Maximum `accordion` items. */
	maxAccordionItems: 24,
	/** Maximum `list` items. */
	maxListItems: 50,
	/** Maximum `select`/`radio` options. */
	maxOptions: 50,
	/** Maximum `table` rows / columns. */
	maxTableRows: 50,
	maxTableCols: 12,
	/** Maximum `chart` data points per series. */
	maxChartPoints: 60,
	/** Maximum `plot` series and per-series parameters. */
	maxPlotSeries: 8,
	maxPlotParams: 6,
	/** Maximum `scene3d` meshes. */
	maxMeshes: 5,
	/** Maximum `quiz` options. */
	maxQuizOptions: 8,
	/** Maximum `steps` / `timeline` / `breadcrumb` / `keyvalue` entries. */
	maxSteps: 24,
	maxTimelineItems: 24,
	maxBreadcrumbItems: 12,
	maxKeyValuePairs: 24,
	/** Maximum `file-tree` nesting. */
	maxTreeDepth: 6,
	/** Maximum `blocks` figure rows / cells per row. Cells are data, not nodes,
	*  so a wide figure still costs one node against `maxNodes`. */
	maxBlocksRows: 14,
	maxBlocksCells: 16,
	/** Maximum `diagram` nodes / edges / zones / focal accents. */
	maxDiagramNodes: 9,
	maxDiagramEdges: 12,
	maxDiagramZones: 3,
	maxDiagramFocal: 2,
	maxDiagramLabel: 14,
	/** Maximum depth of an `echart` option object. */
	maxEChartOptionDepth: 10,
	/** Maximum length of any single array inside an `echart` option. */
	maxEChartArrayLen: 500,
	/** Maximum entries traversed while sanitizing an `echart` option. */
	maxEChartOptionNodes: 2e3
};
// src/client/table-details.ts
/** 使用 table repair 相同的转换规则处理列和行。 */
function prepareTableRows(table) {
	const declaredColumns = table.columns;
	const columnsSpecified = Array.isArray(declaredColumns) && declaredColumns.length > 0;
	let columns = repairColumnValues(columnsSpecified && Array.isArray(declaredColumns) && typeof declaredColumns[0] === "object" && declaredColumns[0] !== null ? declaredColumns.map(columnHeaderText) : declaredColumns);
	let rawRows = table.rows !== void 0 ? table.rows : table.data;
	if (Array.isArray(rawRows) && rawRows.length > 0 && typeof rawRows[0] === "object" && rawRows[0] !== null && !Array.isArray(rawRows[0])) {
		const keys = Array.isArray(table.columns) && table.columns.length > 0 && typeof table.columns[0] === "object" && table.columns[0] !== null ? table.columns.map(columnKeyOf).filter((key) => key !== void 0) : Object.keys(rawRows[0]);
		rawRows = rawRows.map((row) => keys.map((key) => cellText(row[key])));
	}
	let derived = null;
	if (!columnsSpecified && Array.isArray(rawRows) && rawRows.length > 0 && Array.isArray(rawRows[0])) {
		const grid = repairRows(rawRows);
		const candidate = grid.length === 0 ? null : deriveTableColumns(grid);
		if (candidate !== null && repairRows(candidate.rows).length === candidate.rows.length) {
			derived = candidate;
			columns = candidate.columns.map((column) => column.slice(0, 128));
		}
	}
	if (columns.length === 0 && !Array.isArray(table.columns)) return null;
	const rows = repairRows(derived === null ? rawRows : derived.rows);
	if (!Array.isArray(rawRows)) return null;
	return {
		columns: columns.slice(0, GENUI_LIMITS.maxTableCols),
		rows
	};
}
/** 返回 repair 后可显示详情的 table 行。 */
function tableRowsForDetails(table) {
	return prepareTableRows(table)?.rows ?? [];
}
/** 按照 table renderer 的规则识别分组标题行。 */
function isTableGroupHeaderRow(row, types) {
	if (!Array.isArray(row) || !Array.isArray(types) || types[0] !== "group") return false;
	return String(row[0] ?? "").trim() !== "" && row.slice(1).every((cell) => String(cell ?? "").trim() === "");
}
/** 判断详情索引对应的行是否可展开并显示。 */
function isTableDetailReachable(table, rowIndex) {
	const rows = tableRowsForDetails(table);
	return rowIndex >= 0 && rowIndex < rows.length && !isTableGroupHeaderRow(rows[rowIndex], table.types);
}
/** 按照 guard 接受的 object alias 规则修复 table 列。 */
function repairColumnValues(value) {
	if (!Array.isArray(value)) return [];
	const columns = [];
	for (const item of value) {
		if (columns.length >= GENUI_LIMITS.maxTableCols) break;
		if (typeof item === "string") columns.push(item.slice(0, 128));
		else if (item !== null && typeof item === "object") {
			const column = item;
			const label = typeof column.label === "string" ? column.label : typeof column.value === "string" ? column.value : typeof column.title === "string" ? column.title : typeof column.name === "string" && column.name !== "" ? column.name : JSON.stringify(item);
			columns.push(label.slice(0, 128));
		}
	}
	return columns;
}
/** 按照 table repair 的单元格规则裁剪并清理行。 */
function repairRows(value) {
	if (!Array.isArray(value)) return [];
	const rows = [];
	for (const row of value) {
		if (rows.length >= GENUI_LIMITS.maxTableRows) break;
		if (!Array.isArray(row)) continue;
		const cells = [];
		for (const cell of row) {
			if (cells.length >= GENUI_LIMITS.maxTableCols) break;
			if (typeof cell === "string") cells.push(cell.slice(0, 256));
			else if (typeof cell === "number" && Number.isFinite(cell)) cells.push(cell);
		}
		if (cells.length > 0) rows.push(cells);
	}
	return rows;
}
/** 从有效的首行表头生成 table 列。 */
function deriveTableColumns(rows) {
	const header = rows[0];
	if (header === void 0 || header.length === 0) return null;
	const body = rows.slice(1);
	if (body.length === 0) {
		const columns = header.map((cell) => String(cell).trim());
		return columns.every((column) => column !== "") ? {
			columns,
			rows: []
		} : null;
	}
	if (body.every((row) => row.length === header.length)) return {
		columns: header.map((cell) => String(cell).trim()),
		rows: body
	};
	return {
		columns: Array.from({ length: header.length }, (_unused, index) => `列${index + 1}`),
		rows
	};
}
/** 读取 object row 映射到列时使用的 key。 */
function columnKeyOf(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return void 0;
	const column = value;
	for (const key of [
		"key",
		"dataIndex",
		"title",
		"label",
		"name"
	]) if (typeof column[key] === "string" && column[key] !== "") return column[key];
}
/** 将 object row 中的值转换为 table 单元格，并保留列位置。 */
function cellText(value) {
	if (typeof value === "string") return value;
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (value === null || value === void 0) return "";
	return JSON.stringify(value);
}
/** 读取 object column 显示的标题。 */
function columnHeaderText(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) return String(value);
	const column = value;
	for (const key of [
		"title",
		"label",
		"key",
		"dataIndex",
		"name"
	]) if (typeof column[key] === "string" && column[key] !== "") return column[key];
	return JSON.stringify(value);
}
// src/client/genui-runtime/normalize.ts
/** Deterministic GenUI alias and structural normalization. */
function record$1(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
/**
* Resolve an explicit component type or a type uniquely identified by fields.
*
* @param value - Value to inspect without changing it.
* @returns The explicit or inferred component type when available.
*/
function nodeTypeOf(value) {
	const candidate = record$1(value);
	if (candidate === void 0) return void 0;
	if (typeof candidate.type === "string") return candidate.type;
	if ("type" in candidate) return void 0;
	const matches = [];
	if (Array.isArray(candidate.columns) && Array.isArray(candidate.rows)) matches.push("table");
	if (Array.isArray(candidate.pairs)) matches.push("keyvalue");
	if (Array.isArray(candidate.steps)) matches.push("steps");
	if (Array.isArray(candidate.diffs)) matches.push("diff");
	if (Array.isArray(candidate.meshes)) matches.push("scene3d");
	if (Array.isArray(candidate.tabs)) matches.push("tabs");
	return matches.length === 1 ? matches[0] : void 0;
}
/**
* Check whether a value can be treated as a component node.
*
* @param value - Value to inspect without changing it.
* @returns Whether the value has an explicit or uniquely inferred type.
*/
function isNode$1(value) {
	return nodeTypeOf(value) !== void 0;
}
/** Fields a `stat` keeps when a metric record is folded into its own node. */
const STAT_METRIC_FIELDS = [
	"label",
	"value",
	"delta",
	"spark",
	"size"
];
const LIST_ITEM_ALIASES = {
	label: "title",
	name: "title",
	description: "desc",
	content: "desc",
	text: "desc",
	body: "desc",
	detail: "desc"
};
/**
* Normalize one metric record of a stat group into a single-metric `stat`
* node, or null when the entry is not a metric at all.
*/
function statMetricsOf(entries, path, normalizeChild) {
	if (entries.length === 0) return null;
	const metrics = [];
	for (let index = 0; index < entries.length; index++) {
		const entry = entries[index];
		const metric = record$1(entry);
		if (metric === void 0) return null;
		if (isNode$1(entry)) {
			metrics.push(normalizeChild(entry, `${path}.items[${index}]`));
			continue;
		}
		if (typeof metric.label !== "string" && typeof metric.value !== "string") return null;
		const stat = { type: "stat" };
		for (const field of STAT_METRIC_FIELDS) if (metric[field] !== void 0) stat[field] = metric[field];
		metrics.push(stat);
	}
	return metrics;
}
function normalizeAliasFields(value, path, type, warnings) {
	const definition = COMPONENT_SCHEMAS[type];
	if (definition === void 0) return value;
	const out = { ...value };
	for (const [alias, canonical] of Object.entries(definition.aliases)) {
		if (!(alias in out)) continue;
		const aliasPath = `${path}.${alias}`;
		const keptCanonical = canonical in out;
		if (!keptCanonical) out[canonical] = out[alias];
		delete out[alias];
		warnings.push({
			kind: "alias",
			path: aliasPath,
			message: keptCanonical ? `${aliasPath} is ignored because canonical field '${canonical}' is present` : `${aliasPath} normalized/adopted as '${canonical}'`,
			type,
			field: alias,
			canonical
		});
	}
	for (const [field, values] of Object.entries(definition.valueAliases)) {
		const written = out[field];
		if (typeof written !== "string") continue;
		const canonical = values[written];
		if (canonical === void 0 || canonical === written) continue;
		out[field] = canonical;
		warnings.push({
			kind: "alias",
			path: `${path}.${field}`,
			message: `${path}.${field} '${written}' normalized to '${canonical}'`,
			type,
			field,
			canonical
		});
	}
	return out;
}
/**
* Apply a nested record schema's field aliases to a record tree: every entry
* of an array (and every nested record collection below it) is rewritten in
* place-equivalent copies, so validation, repair, and diagnostics all see the
* canonical record fields (`keyvalue.pairs[].label → key`,
* `file-tree.items[].label → name`, issue #186).
*/
function normalizeRecordTree(value, definition, at, type, warnings) {
	if (Array.isArray(value)) return value.map((entry, index) => normalizeRecordTree(entry, definition, `${at}[${index}]`, type, warnings));
	const holder = record$1(value);
	if (holder === void 0) return value;
	const out = { ...holder };
	for (const [alias, canonical] of Object.entries(definition.aliases)) {
		if (!(alias in out) || canonical in out) continue;
		out[canonical] = out[alias];
		delete out[alias];
		warnings.push({
			kind: "alias",
			path: `${at}.${alias}`,
			message: `${at}.${alias} normalized/adopted as '${canonical}'`,
			type,
			field: alias,
			canonical
		});
	}
	for (const [field, nested] of Object.entries(definition.nested)) if (out[field] !== void 0) out[field] = normalizeRecordTree(out[field], nested, `${at}.${field}`, type, warnings);
	return out;
}
/**
* file-tree parents without a `type`: a record that carries `children` is a
* directory in every model-written tree, and the renderer's collapse
* affordance depends on the marker (issue #186).
*/
function defaultFileTreeDirectories(value) {
	if (Array.isArray(value)) return value.map(defaultFileTreeDirectories);
	const holder = record$1(value);
	if (holder === void 0) return value;
	const out = { ...holder };
	if (out.type === void 0 && Array.isArray(out.children)) out.type = "dir";
	if (out.children !== void 0) out.children = defaultFileTreeDirectories(out.children);
	return out;
}
/**
* Normalize one component node and its renderer-reachable children.
*
* @param value - Raw component or other value.
* @param path - Stable diagnostic path for this node.
* @param warnings - Alias and structural normalization diagnostics.
* @returns The normalized component, or the original value when it is not a node.
*/
function normalizeNode(value, path, warnings) {
	const type = nodeTypeOf(value);
	const candidate = record$1(value);
	if (type === void 0 || candidate === void 0) return value;
	const node = typeof candidate.type === "string" ? candidate : {
		...candidate,
		type
	};
	const definition = COMPONENT_SCHEMAS[type];
	if (definition === void 0) return node;
	const out = normalizeAliasFields(node, path, type, warnings);
	for (const [field, nested] of Object.entries(definition.nested)) if (out[field] !== void 0) out[field] = normalizeRecordTree(out[field], nested, `${path}.${field}`, type, warnings);
	const normalizeNodeValue = (child, childPath) => normalizeNode(child, childPath, warnings);
	const normalizeNodeArray = (children, childPath) => Array.isArray(children) ? children.map((child, index) => normalizeNodeValue(child, `${childPath}[${index}]`)) : children;
	if (type === "file-tree" && out.items !== void 0) out.items = defaultFileTreeDirectories(out.items);
	if (type === "stat" && Array.isArray(out.items) && out.label === void 0 && out.value === void 0) {
		const metrics = statMetricsOf(out.items, path, normalizeNodeValue);
		if (metrics !== null) {
			warnings.push({
				kind: "alias",
				path: `${path}.items`,
				message: `${path}.items normalized into a row of 'stat' nodes`,
				type,
				field: "items",
				canonical: "row"
			});
			return {
				type: "row",
				items: metrics,
				...out.span !== void 0 ? { span: out.span } : {}
			};
		}
	}
	if (type === "row" || type === "col" || type === "grid" || type === "card" || type === "file-tree" || type === "timeline" || type === "breadcrumb") {
		if (type !== "file-tree" && type !== "timeline" && type !== "breadcrumb") out.items = normalizeNodeArray(out.items, `${path}.items`);
	} else if (type === "list" && Array.isArray(out.items)) out.items = out.items.map((child, index) => {
		if (isNode$1(child)) return normalizeNodeValue(child, `${path}.items[${index}]`);
		if (Array.isArray(child) && child.length === 1 && typeof child[0] === "string") return child[0];
		const holder = record$1(child);
		if (holder === void 0) return child;
		const normalizedHolder = { ...holder };
		const itemPath = `${path}.items[${index}]`;
		for (const [alias, canonical] of Object.entries(LIST_ITEM_ALIASES)) {
			if (!(alias in normalizedHolder)) continue;
			const keptCanonical = canonical in normalizedHolder;
			if (!keptCanonical) normalizedHolder[canonical] = normalizedHolder[alias];
			delete normalizedHolder[alias];
			warnings.push({
				kind: "alias",
				path: `${itemPath}.${alias}`,
				type,
				field: alias,
				canonical,
				message: keptCanonical ? `${itemPath}.${alias} is ignored because canonical field '${canonical}' is present` : `${itemPath}.${alias} normalized/adopted as '${canonical}'`
			});
		}
		if (!("title" in normalizedHolder) && typeof normalizedHolder.desc === "string") {
			normalizedHolder.title = normalizedHolder.desc;
			delete normalizedHolder.desc;
			warnings.push({
				kind: "alias",
				path: `${itemPath}.desc`,
				type,
				field: "desc",
				canonical: "title",
				message: `${itemPath}.desc normalized/adopted as 'title'`
			});
		}
		return normalizedHolder;
	});
	else if (type === "keyvalue" && Array.isArray(out.pairs)) {
		if (out.pairs.length > 0 && out.pairs.every((pair) => Array.isArray(pair))) out.pairs = out.pairs.map((pair) => {
			const cells = pair;
			return {
				key: cells[0],
				value: cells.length > 1 ? cells[1] : ""
			};
		});
	} else if (type === "tabs" && Array.isArray(out.tabs)) out.tabs = out.tabs.map((tab, index) => {
		const holder = record$1(tab);
		if (holder === void 0) return tab;
		const normalizedHolder = { ...holder };
		if ("content" in normalizedHolder) {
			const tabPath = `${path}.tabs[${index}].content`;
			const hasItems = "items" in normalizedHolder;
			if (!hasItems) normalizedHolder.items = normalizedHolder.content;
			delete normalizedHolder.content;
			warnings.push({
				kind: "alias",
				path: tabPath,
				message: hasItems ? `${tabPath} is ignored because canonical field 'items' is present` : `${tabPath} normalized/adopted as 'items'`,
				type,
				field: "content",
				canonical: "items"
			});
		}
		normalizedHolder.items = Array.isArray(normalizedHolder.items) ? normalizedHolder.items.map((child, childIndex) => normalizeNodeValue(child, `${path}.tabs[${index}].items[${childIndex}]`)) : normalizedHolder.items === void 0 ? [] : [normalizeNodeValue(normalizedHolder.items, `${path}.tabs[${index}].items[0]`)];
		return normalizedHolder;
	});
	else if (type === "accordion" && Array.isArray(out.items)) out.items = out.items.map((item, index) => {
		const holder = record$1(item);
		if (holder === void 0) return item;
		return {
			...holder,
			items: Array.isArray(holder.items) ? holder.items.map((child, childIndex) => normalizeNodeValue(child, `${path}.items[${index}].items[${childIndex}]`)) : holder.items
		};
	});
	else if (type === "table" && Array.isArray(out.details)) {
		const table = {
			columns: out.columns,
			rows: out.rows,
			types: out.types
		};
		out.details = out.details.map((detail, rowIndex) => {
			if (!Array.isArray(detail) || !isTableDetailReachable(table, rowIndex)) return detail;
			return detail.map((child, childIndex) => normalizeNodeValue(child, `${path}.details[${rowIndex}][${childIndex}]`));
		});
	}
	return out;
}
/**
* Normalize a raw GenUI value into canonical field names.
*
* Only deterministic aliases and structural aliases are changed. Resource
* limits, type repair, security filtering, and semantic validation remain in
* the guard layer. Unknown component types are returned opaque.
*
* @param value - Raw GenUI spec or bare native component.
* @returns Canonical value and stable alias diagnostics.
*/
function normalizeGenuiSpec(value) {
	const warnings = [];
	if (typeof value === "string") try {
		const decoded = JSON.parse(value);
		if (record$1(decoded) !== void 0 || Array.isArray(decoded)) {
			value = decoded;
			warnings.push({
				kind: "alias",
				path: "spec",
				message: "double-encoded JSON string unwrapped into a spec value"
			});
		}
	} catch {}
	if (Array.isArray(value) && value.length > 0) {
		value = { items: value };
		warnings.push({
			kind: "alias",
			path: "items",
			message: "root array normalized into an items envelope"
		});
	}
	const root = record$1(value);
	if (root === void 0) return {
		value,
		warnings
	};
	const out = { ...root };
	if (isComponentRoot(out)) return {
		value: normalizeNode(out, "spec", warnings),
		warnings
	};
	if (Array.isArray(out.items)) out.items = out.items.map((item, index) => normalizeNode(item, `items[${index}]`, warnings));
	return {
		value: out,
		warnings
	};
}
// src/client/genui-runtime/diagnostics.ts
/** GenUI runtime diagnostics for aliases and unknown fields. */
function record(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
function isNode(value) {
	const candidate = record(value);
	return candidate !== void 0 && typeof candidate.type === "string";
}
function visitNativeNodes(value, path, visit) {
	if (!isNode(value)) return;
	const type = value.type;
	const definition = COMPONENT_SCHEMAS[type];
	if (definition === void 0) return;
	visit(value, path, definition);
	const children = (child, childPath) => visitNativeNodes(child, childPath, visit);
	if ((type === "row" || type === "col" || type === "grid" || type === "card") && Array.isArray(value.items)) value.items.forEach((child, index) => children(child, `${path}.items[${index}]`));
	else if (type === "list" && Array.isArray(value.items)) value.items.forEach((child, index) => children(child, `${path}.items[${index}]`));
	else if (type === "tabs" && Array.isArray(value.tabs)) value.tabs.forEach((tab, index) => {
		const holder = record(tab);
		if (holder === void 0) return;
		if (Array.isArray(holder.items)) holder.items.forEach((child, childIndex) => children(child, `${path}.tabs[${index}].items[${childIndex}]`));
		else children(holder.items, `${path}.tabs[${index}].items`);
	});
	else if (type === "accordion" && Array.isArray(value.items)) value.items.forEach((item, index) => {
		const holder = record(item);
		if (holder?.items !== void 0 && Array.isArray(holder.items)) holder.items.forEach((child, childIndex) => children(child, `${path}.items[${index}].items[${childIndex}]`));
	});
	else if (type === "table" && Array.isArray(value.details)) {
		const table = {
			columns: value.columns,
			rows: value.rows,
			types: value.types
		};
		value.details.forEach((detail, rowIndex) => {
			if (Array.isArray(detail) && isTableDetailReachable(table, rowIndex)) detail.forEach((child, childIndex) => children(child, `${path}.details[${rowIndex}][${childIndex}]`));
		});
	}
}
function pushUnknownField(warnings, path, field, type) {
	warnings.push({
		kind: "unknown-field",
		path: `${path}.${field}`,
		message: `${path}.${field}: unknown field for '${type}'`,
		type,
		field
	});
}
function diagnoseRecordFields(value, path, definition, type, warnings) {
	const holder = record(value);
	if (holder === void 0) return;
	for (const field of Object.keys(holder)) {
		if (field in definition.fields) continue;
		pushUnknownField(warnings, path, field, type);
	}
	for (const [field, nested] of Object.entries(definition.nested)) {
		const nestedValue = holder[field];
		if (Array.isArray(nestedValue)) nestedValue.forEach((item, index) => diagnoseRecordFields(item, `${path}.${field}[${index}]`, nested, type, warnings));
		else if (nestedValue !== void 0) diagnoseRecordFields(nestedValue, `${path}.${field}`, nested, type, warnings);
	}
}
function diagnoseNestedFields(node, path, definition, warnings) {
	for (const [field, nested] of Object.entries(definition.nested)) {
		const nestedValue = node[field];
		if (Array.isArray(nestedValue)) nestedValue.forEach((item, index) => diagnoseRecordFields(item, `${path}.${field}[${index}]`, nested, node.type, warnings));
		else if (nestedValue !== void 0) diagnoseRecordFields(nestedValue, `${path}.${field}`, nested, node.type, warnings);
	}
}
/**
* Diagnose unknown direct fields on native nodes.
*
* Unknown types are intentionally skipped so custom renderers retain their
* opaque extension payloads. Native unknown fields are warnings, not errors.
*
* @param value - Canonical or raw GenUI value.
* @returns Stable field diagnostics in tree order.
*/
function diagnoseUnknownGenuiFields(value) {
	const warnings = [];
	const root = record(value);
	if (root === void 0) return warnings;
	const visit = (node, path, definition) => {
		for (const field of Object.keys(node)) {
			if (field === "type" || field in definition.fields) continue;
			pushUnknownField(warnings, path, field, node.type);
		}
		diagnoseNestedFields(node, path, definition, warnings);
		if (node.type === "list" && Array.isArray(node.items)) node.items.forEach((item, index) => {
			if (isNode(item)) return;
			const holder = record(item);
			if (holder === void 0) return;
			for (const field of Object.keys(holder)) {
				if (field === "title" || field === "desc") continue;
				const itemPath = `${path}.items[${index}]`;
				warnings.push({
					kind: "unknown-field",
					path: `${itemPath}.${field}`,
					message: `${itemPath}.${field}: list items render 'title' and 'desc' only — '${field}' is dropped`,
					type: "list",
					field
				});
			}
		});
	};
	if (Array.isArray(root.items) && !isComponentRoot(root)) {
		for (const field of Object.keys(root)) {
			if (field in GENUI_SPEC_SCHEMA.fields) continue;
			pushUnknownField(warnings, "spec", field, "spec");
		}
		root.items.forEach((item, index) => visitNativeNodes(item, `items[${index}]`, visit));
	} else if (typeof root.type === "string") visitNativeNodes(root, "spec", visit);
	else for (const field of Object.keys(root)) {
		if (field in GENUI_SPEC_SCHEMA.fields) continue;
		pushUnknownField(warnings, "spec", field, "spec");
	}
	return warnings;
}
// src/client/walk-spec.ts
/** 遍历完整 GenUI 组件树，并提供每个组件在 spec 中的路径。 */
function walkGenuiNodes(spec, visitor) {
	const walk = (nodes, path, depth) => {
		if (depth > GENUI_LIMITS.maxDepth) return;
		nodes.forEach((node, index) => visit(node, `${path}[${index}]`, depth));
	};
	const visit = (node, at, depth) => {
		if (depth > GENUI_LIMITS.maxDepth) return;
		visitor(node, at);
		if (depth >= GENUI_LIMITS.maxDepth) return;
		switch (node.type) {
			case "row":
			case "col":
			case "grid":
			case "card":
				walk(node.items, `${at}.items`, depth + 1);
				break;
			case "tabs":
				node.tabs.forEach((tab, tabIndex) => walk(tab.items, `${at}.tabs[${tabIndex}].items`, depth + 1));
				break;
			case "accordion":
				node.items.forEach((item, itemIndex) => walk(item.items, `${at}.items[${itemIndex}].items`, depth + 1));
				break;
			case "list":
				node.items.forEach((item, itemIndex) => {
					if (item !== null && typeof item === "object" && "type" in item) visit(item, `${at}.items[${itemIndex}]`, depth + 1);
				});
				break;
			case "table": node.details?.slice(0, tableRowsForDetails(node).length).forEach((detail, rowIndex) => {
				if (detail !== null && isTableDetailReachable(node, rowIndex)) walk(detail, `${at}.details[${rowIndex}]`, depth + 1);
			});
		}
	};
	walk(spec.items, "items", 0);
}
// src/client/submission-registry.ts
/** 从 spec 建立成员表，并诊断 submission key 和 submit.groups。 */
function analyzeSubmissionRegistry(spec) {
	const members = /* @__PURE__ */ new Map();
	const paths = /* @__PURE__ */ new Map();
	const diagnostics = [];
	const submits = [];
	walkGenuiNodes(spec, (node, path) => {
		if (node.type === "submit") {
			if (node.groups !== void 0) submits.push({
				groups: node.groups,
				path
			});
			return;
		}
		let member;
		let keyPath;
		switch (node.type) {
			case "radio":
				if (node.group === void 0) return;
				member = {
					kind: "radio",
					key: node.group,
					label: node.label ?? node.group,
					options: node.options.slice(0, GENUI_LIMITS.maxOptions),
					...node.answer === void 0 ? {} : { answer: node.answer },
					...node.explanation === void 0 ? {} : { explanation: node.explanation }
				};
				keyPath = `${path}.group`;
				break;
			case "checkbox":
				if (node.group === void 0) return;
				member = {
					kind: "checkbox",
					key: node.group
				};
				keyPath = `${path}.group`;
				break;
			case "input":
			case "textarea":
			case "select":
			case "slider":
				if (node.id === void 0) return;
				member = {
					kind: "field",
					key: node.id,
					fieldType: node.type,
					secret: node.type === "input" && node.inputType === "password"
				};
				keyPath = `${path}.id`;
				break;
			default: return;
		}
		if (member === void 0) return;
		const existing = members.get(member.key);
		if (existing !== void 0) {
			if (existing.kind !== "checkbox" || member.kind !== "checkbox") diagnostics.push(`${keyPath} conflicts with ${paths.get(member.key)}: submission key '${member.key}' is already used`);
			return;
		}
		members.set(member.key, member);
		paths.set(member.key, keyPath);
	});
	for (const { groups, path } of submits) {
		const seen = /* @__PURE__ */ new Set();
		groups.forEach((key, index) => {
			const at = `${path}.groups[${index}]`;
			if (seen.has(key)) diagnostics.push(`${at}: duplicate submission member '${key}'`);
			seen.add(key);
			const member = members.get(key);
			if (member === void 0) diagnostics.push(`${at}: submit.groups references unknown submission member '${key}'`);
			else if (member.kind === "field" && member.secret) diagnostics.push(`${at}: submit.groups cannot require secret field '${key}'`);
		});
	}
	return {
		registry: { members },
		diagnostics
	};
}
// src/client/genui-runtime/value-utils.ts
/** Shared primitive sanitizers used by the GenUI guard. */
/** Is `value` one of `values`? */
function inEnum(value, values) {
	return typeof value === "string" && values.includes(value);
}
/** String field: truncate a string to `cap`, or undefined when not a string. */
function str(value, cap) {
	return typeof value === "string" ? value.slice(0, cap) : void 0;
}
/**
* Color field: the value lands in an inline `style` (background/stroke) or
* THREE.Color. Arbitrary CSS values are an exfiltration channel, so only
* literal color formats and host design tokens are accepted.
*/
const SAFE_COLOR_RE = /^(?:#[\da-fA-F]{3,8}|rgba?\([^)]{0,64}\)|hsla?\([^)]{0,64}\)|var\(--dsw-[\w-]+(?:,\s*#[0-9a-fA-F]{3,8})?\))$/;
function color(value) {
	if (typeof value !== "string") return void 0;
	const normalized = value.trim();
	return normalized.length <= 64 && SAFE_COLOR_RE.test(normalized) ? normalized : void 0;
}
/** Keep only http(s) and mailto link targets. */
function safeHref(value) {
	if (typeof value !== "string") return void 0;
	const normalized = value.trim();
	if (normalized.length > 2048) return void 0;
	return /^https?:\/\//i.test(normalized) || /^mailto:[^@\s]+@[^@\s]+$/i.test(normalized) ? normalized : void 0;
}
/** Keep browser-reachable http(s) or same-origin relative media paths. */
function safeMediaSrc(value) {
	if (typeof value !== "string") return void 0;
	const normalized = value.trim();
	if (normalized === "" || normalized.length > 2048) return void 0;
	if (/^https?:\/\//i.test(normalized)) return normalized;
	if (/^[a-z][a-z0-9+.-]*:/i.test(normalized) || /^[/\\]{2}/.test(normalized)) return void 0;
	return normalized;
}
/** Finite-number field: clamp into [min, max], or undefined when not finite. */
function num(value, min, max) {
	return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : void 0;
}
/** Integer field: clamp into [min, max], or undefined when not a finite number. */
function int(value, min, max) {
	return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.trunc(value))) : void 0;
}
/** Optional enum field: the value when it matches, otherwise undefined. */
function enu(value, values) {
	return inEnum(value, values) ? value : void 0;
}
/** Plain object (not array, not null). */
function obj(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
}
/** Preserve an optional field only when its value exists. */
function opt(key, value) {
	return value === void 0 ? {} : { [key]: value };
}
// src/client/file-link.ts
/** Decode a local file destination and its optional first line fragment. */
function parseFileLink(value) {
	if (value.length > 2048) return void 0;
	const hash = value.indexOf("#");
	const destination = hash < 0 ? value : value.slice(0, hash);
	if (destination.includes("?")) return void 0;
	let path;
	try {
		path = decodeURIComponent(destination);
	} catch {
		return;
	}
	if (path === "" || /[\u0000-\u001f\u007f]/.test(path) || /^[\\/]{2}/.test(path) || /^[a-z][a-z\d+.-]*:/i.test(path) && !/^[a-z]:[\\/]/i.test(path)) return void 0;
	if (hash < 0) return { path };
	const match = /^L([1-9]\d*)(?:-L([1-9]\d*))?$/.exec(value.slice(hash + 1));
	if (match === null) return void 0;
	const line = Number(match[1]);
	const end = match[2] === void 0 ? line : Number(match[2]);
	if (!Number.isSafeInteger(line) || !Number.isSafeInteger(end) || end < line) return void 0;
	return {
		path,
		line
	};
}
/** Classify a link destination while preserving the existing external URL policy. */
function classifyLinkTarget(value) {
	const external = safeHref(value);
	if (external !== void 0) return {
		type: "external",
		href: external
	};
	if (typeof value !== "string") return { type: "invalid" };
	const file = parseFileLink(value.trim());
	return file === void 0 ? { type: "invalid" } : {
		type: "file",
		file
	};
}
// src/client/guard.ts
function fieldKindMatches(value, kind) {
	switch (kind) {
		case "string": return typeof value === "string";
		case "string-or-null": return value === null || typeof value === "string";
		case "number": return typeof value === "number" && Number.isFinite(value);
		case "boolean": return typeof value === "boolean";
		case "nodes": return Array.isArray(value);
		case "array": return Array.isArray(value);
		case "object": return obj(value) !== void 0;
		case "unknown": return true;
	}
}
function fieldKindLabel(kind) {
	switch (kind) {
		case "string-or-null": return "a string or null";
		case "number": return "a finite number";
		case "boolean": return "a boolean";
		case "nodes":
		case "array": return "an array";
		case "object": return "an object";
		case "unknown": return "a value";
		default: return "a string";
	}
}
/** Detect an existing field diagnostic using both canonical and legacy messages. */
function hasFieldError(errors, at, field) {
	return errors.some((error) => error.startsWith(`${at}.${field} `) || error.includes(`'${field}'`) || error.includes(`requires ${field}`));
}
/** Validate present fields against the runtime schema without duplicating errors. */
function validateSchemaFieldKinds(value, at, definition, errors, excludedFields = []) {
	for (const [field, kind] of Object.entries(definition.fields)) {
		if (excludedFields.includes(field) || value[field] === void 0) continue;
		if (!fieldKindMatches(value[field], kind) && !hasFieldError(errors, at, field)) errors.push(`${at}.${field} must be ${fieldKindLabel(kind)}`);
	}
	for (const [field, values] of Object.entries(definition.enums)) {
		if (excludedFields.includes(field) || value[field] === void 0 || !fieldKindMatches(value[field], "string")) continue;
		if (!values.includes(value[field]) && !hasFieldError(errors, at, field)) errors.push(`${at}.${field} must be one of ${values.join(", ")}`);
	}
}
/** Validate one schema-declared nested record and all records below it. */
function validateRecordSchema(value, at, definition, errors) {
	const holder = obj(value);
	if (holder === void 0) {
		errors.push(`${at} must be an object`);
		return;
	}
	for (const field of definition.required) {
		const kind = definition.fields[field];
		if (holder[field] === void 0) {
			if (!hasFieldError(errors, at, field)) errors.push(`${at}: requires ${field}${kind === void 0 ? "" : ` (${fieldKindLabel(kind)})`}`);
		} else if (kind !== void 0 && !fieldKindMatches(holder[field], kind)) {
			if (!hasFieldError(errors, at, field)) errors.push(`${at}.${field} must be ${fieldKindLabel(kind)}`);
		}
	}
	for (const [field, kind] of Object.entries(definition.fields)) if (holder[field] !== void 0 && !fieldKindMatches(holder[field], kind)) {
		if (!hasFieldError(errors, at, field)) errors.push(`${at}.${field} must be ${fieldKindLabel(kind)}`);
	}
	for (const [field, values] of Object.entries(definition.enums)) if (holder[field] !== void 0 && typeof holder[field] === "string" && !values.includes(holder[field])) {
		if (!hasFieldError(errors, at, field)) errors.push(`${at}.${field} must be one of ${values.join(", ")}`);
	}
	for (const [field, nested] of Object.entries(definition.nested)) {
		const nestedValue = holder[field];
		if (nestedValue === void 0) continue;
		if (Array.isArray(nestedValue)) nestedValue.forEach((item, index) => validateRecordSchema(item, `${at}.${field}[${index}]`, nested, errors));
		else validateRecordSchema(nestedValue, `${at}.${field}`, nested, errors);
	}
}
/** Validate registry-declared nested records before repair can discard them. */
function validateNestedRecordSchemas(value, at, definition, errors) {
	for (const [field, nested] of Object.entries(definition.nested)) {
		const nestedValue = value[field];
		if (nestedValue === void 0) continue;
		if (Array.isArray(nestedValue)) nestedValue.forEach((item, index) => validateRecordSchema(item, `${at}.${field}[${index}]`, nested, errors));
		else validateRecordSchema(nestedValue, `${at}.${field}`, nested, errors);
	}
}
/**
* Does this table state its columns implicitly, in a 2D `rows`/`data` body?
* Repair turns the leading row into the header (see `deriveTableColumns`), so
* validation must not report the missing `columns` that repair is about to
* supply — while still reporting it for bodies repair cannot read (a scalar
* `rows`, an empty array, a 1D list).
*/
function hasDerivableTableColumns(value) {
	const rows = value.rows !== void 0 ? value.rows : value.data;
	if (!Array.isArray(rows) || rows.length === 0) return false;
	return Array.isArray(rows[0]);
}
/** Validate the registry-declared presence and primitive shape of a native node. */
function validateRegistryFields(value, at, definition, errors) {
	const type = String(value.type);
	const alreadyReported = (field) => hasFieldError(errors, at, field);
	const derivableField = type === "table" && hasDerivableTableColumns(value) ? "columns" : null;
	for (const field of definition.required) {
		const kind = definition.fields[field];
		if (kind === void 0 || value[field] === void 0) {
			if (field !== derivableField && !alreadyReported(field)) errors.push(`${at}: type '${type}' requires ${field}${kind === void 0 ? "" : ` (${fieldKindLabel(kind)})`}`);
			continue;
		}
		if (!fieldKindMatches(value[field], kind) && !alreadyReported(field)) errors.push(`${at}.${field} must be ${fieldKindLabel(kind)}`);
	}
	validateSchemaFieldKinds(value, at, definition, errors, ["type"]);
	for (const group of definition.oneOfRequired) if (!group.some((field) => value[field] !== void 0) && !errors.some((error) => error.includes(`requires ${group.join(" or ")}`))) errors.push(`${at}: type '${type}' requires one of ${group.join(" or ")}`);
	for (const rule of definition.conditionalRequired) {
		if (value[rule.when.field] !== rule.when.equals) continue;
		for (const field of rule.required) if (value[field] === void 0 && !alreadyReported(field)) errors.push(`${at}: type '${type}' requires ${field}${rule.message === void 0 ? "" : ` (${rule.message})`}`);
	}
	validateNestedRecordSchemas(value, at, definition, errors);
}
/** Walk `list` with the shared node budget; drops invalid entries. */
function repairItems(list, ctx, depth) {
	if (!Array.isArray(list)) return [];
	const out = [];
	for (const item of list) {
		if (ctx.remaining <= 0) break;
		ctx.remaining -= 1;
		const node = repairNode(item, ctx, depth);
		if (node !== null) out.push(node);
	}
	return out;
}
/** Optional explicit palette: up to 12 validated colour values. */
function paletteValues(v) {
	if (!Array.isArray(v)) return void 0;
	const out = [];
	for (const item of v.slice(0, 12)) {
		const value = color(item);
		if (value === void 0) continue;
		out.push(value);
	}
	return out.length > 0 ? out : void 0;
}
/** Optional `stat.spark` series: finite numbers only, 2..60 points. */
function sparkValues(v) {
	if (!Array.isArray(v)) return void 0;
	const out = [];
	for (const item of v.slice(0, 60)) {
		const n = typeof item === "number" ? item : Number(item);
		if (!Number.isFinite(n)) return void 0;
		out.push(n);
	}
	return out.length >= 2 ? out : void 0;
}
/** Layout hints are component-agnostic: `span` survives repair on ANY node
*  (the renderer applies it inside a grid). Kept out of the per-case switches
*  so a new component type cannot forget it. */
function repairNode(value, ctx, depth) {
	const node = repairNodeFields(value, ctx, depth);
	if (node === null) return null;
	const span = int(obj(value)?.span, 2, 12);
	return span === void 0 ? node : {
		...node,
		span
	};
}
function repairNodeFields(value, ctx, depth) {
	if (depth > GENUI_LIMITS.maxDepth) return null;
	const v = obj(value);
	if (v === void 0) return null;
	const type = v.type;
	if (typeof type !== "string") return null;
	switch (type) {
		case "text": {
			const content = str(v.content, GENUI_LIMITS.maxString) ?? str(v.text, GENUI_LIMITS.maxString);
			if (content === void 0) return null;
			return {
				type: "text",
				content,
				...opt("size", enu(v.size, TEXT_SIZES)),
				...opt("align", enu(v.align, TEXT_ALIGNS)),
				...opt("tone", enu(v.tone, TEXT_TONES)),
				...opt("mono", v.mono === true ? true : void 0),
				...opt("center", v.center === true ? true : void 0)
			};
		}
		case "icon": {
			const name = str(v.name, 64);
			if (name === void 0) return null;
			return {
				type: "icon",
				name,
				...opt("label", str(v.label, GENUI_LIMITS.maxString)),
				...opt("tone", enu(v.tone, ICON_TONES)),
				...opt("size", int(v.size, 8, 96)),
				...opt("tile", v.tile === true ? true : void 0)
			};
		}
		case "blocks": {
			if (!Array.isArray(v.rows)) return null;
			const rows = v.rows.slice(0, GENUI_LIMITS.maxBlocksRows).flatMap((entry) => {
				const row = obj(entry);
				if (row === void 0 || !Array.isArray(row.cells)) return [];
				return [{
					cells: row.cells.slice(0, GENUI_LIMITS.maxBlocksCells).map((cell) => {
						if (cell === null) return null;
						if (typeof cell === "string") return str(cell, GENUI_LIMITS.maxString) ?? "";
						const holder = obj(cell);
						if (holder === void 0) return null;
						const text = str(holder.text, GENUI_LIMITS.maxString);
						if (text === void 0) return null;
						return {
							text,
							...opt("color", color(holder.color)),
							...opt("tone", enu(holder.tone, BLOCK_CELL_TONES)),
							...opt("sub", str(holder.sub, 128))
						};
					}),
					...opt("label", str(row.label, 128)),
					...opt("color", color(row.color)),
					...opt("variant", enu(row.variant, BLOCKS_VARIANTS))
				}];
			});
			if (rows.length === 0) return null;
			return {
				type: "blocks",
				rows,
				...opt("columns", int(v.columns, 1, GENUI_LIMITS.maxBlocksCells)),
				...opt("title", str(v.title, GENUI_LIMITS.maxString)),
				...opt("caption", str(v.caption, GENUI_LIMITS.maxString))
			};
		}
		case "arrow": return {
			type: "arrow",
			...opt("dir", enu(v.dir, ARROW_DIRS)),
			...opt("length", int(v.length, 16, 96)),
			...opt("label", str(v.label, 200))
		};
		case "row": return {
			type: "row",
			items: repairItems(v.items, ctx, depth + 1),
			...opt("wrap", v.wrap === true ? true : void 0),
			...opt("spacer", v.spacer === true ? true : void 0),
			...opt("justify", enu(v.justify, ROW_JUSTIFY))
		};
		case "col": return {
			type: "col",
			items: repairItems(v.items, ctx, depth + 1),
			...opt("gap", num(v.gap, 0, 96)),
			...opt("width", num(v.width, 1, 100))
		};
		case "grid": return {
			type: "grid",
			cols: int(v.cols, 1, GENUI_LIMITS.maxGridCols) ?? 1,
			items: repairItems(v.items, ctx, depth + 1)
		};
		case "card": return {
			type: "card",
			items: repairItems(v.items, ctx, depth + 1),
			...opt("eyebrow", str(v.eyebrow, 64)),
			...opt("title", str(v.title, GENUI_LIMITS.maxString)),
			...opt("tone", enu(v.tone, CARD_TONES)),
			...opt("accent", color(v.accent)),
			...opt("flat", v.flat === true ? true : void 0)
		};
		case "button": {
			const label = str(v.label, GENUI_LIMITS.maxString);
			if (label === void 0) return null;
			return {
				type: "button",
				label,
				...opt("tone", enu(v.tone, BUTTON_TONES)),
				...opt("full", v.full === true ? true : void 0),
				...opt("small", v.small === true ? true : void 0),
				...opt("icon", str(v.icon, 64)),
				...opt("action", str(v.action, 200))
			};
		}
		case "input": return {
			type: "input",
			...opt("label", str(v.label, GENUI_LIMITS.maxString)),
			...opt("placeholder", str(v.placeholder, GENUI_LIMITS.maxString)),
			...opt("value", str(v.value, GENUI_LIMITS.maxString)),
			...opt("inputType", enu(v.inputType, INPUT_TYPES)),
			...opt("action", str(v.action, 200)),
			...opt("id", str(v.id, 200))
		};
		case "select": {
			const options = repairStrings(v.options, GENUI_LIMITS.maxOptions, GENUI_LIMITS.maxString);
			if (options === void 0) return null;
			return {
				type: "select",
				options,
				...opt("label", str(v.label, GENUI_LIMITS.maxString)),
				...opt("action", str(v.action, 200)),
				...opt("selected", int(v.selected, 0, options.length - 1)),
				...opt("id", str(v.id, 200))
			};
		}
		case "checkbox": {
			const label = str(v.label, GENUI_LIMITS.maxString);
			if (label === void 0) return null;
			return {
				type: "checkbox",
				label,
				...opt("checked", v.checked === true ? true : void 0),
				...opt("action", str(v.action, 200)),
				...opt("group", str(v.group, 200))
			};
		}
		case "link": {
			const label = str(v.label, GENUI_LIMITS.maxString);
			if (label === void 0) return null;
			const target = classifyLinkTarget(v.href);
			return {
				type: "link",
				label,
				...opt("href", target.type === "external" ? target.href : target.type === "file" ? String(v.href).trim() : void 0)
			};
		}
		case "image": {
			const src = safeMediaSrc(v.src);
			if (src === void 0) return null;
			return {
				type: "image",
				src,
				...opt("alt", str(v.alt, GENUI_LIMITS.maxString)),
				...opt("caption", str(v.caption, GENUI_LIMITS.maxString))
			};
		}
		case "audio": {
			const src = safeMediaSrc(v.src);
			if (src === void 0) return null;
			return {
				type: "audio",
				src,
				...opt("alt", str(v.alt, GENUI_LIMITS.maxString)),
				...opt("loop", v.loop === true ? true : void 0)
			};
		}
		case "video": {
			const src = safeMediaSrc(v.src);
			if (src === void 0) return null;
			return {
				type: "video",
				src,
				...opt("alt", str(v.alt, GENUI_LIMITS.maxString)),
				...opt("poster", safeMediaSrc(v.poster)),
				...opt("loop", v.loop === true ? true : void 0),
				...opt("muted", v.muted === true ? true : void 0),
				...opt("aspectRatio", enu(v.aspectRatio, MEDIA_ASPECT_RATIOS))
			};
		}
		case "badge": {
			const label = str(v.label, GENUI_LIMITS.maxString) ?? str(v.text, GENUI_LIMITS.maxString) ?? str(v.value, GENUI_LIMITS.maxString);
			if (label === void 0) return null;
			return {
				type: "badge",
				label,
				...opt("tone", enu(v.tone, BADGE_TONES)),
				...opt("icon", str(v.icon, 64))
			};
		}
		case "hero": {
			const title = str(v.title, GENUI_LIMITS.maxString);
			if (title === void 0) return null;
			return {
				type: "hero",
				title,
				...opt("subtitle", str(v.subtitle, GENUI_LIMITS.maxString)),
				...opt("value", str(v.value, 128)),
				...opt("label", str(v.label, GENUI_LIMITS.maxString)),
				...opt("delta", str(v.delta, 64)),
				...opt("spark", sparkValues(v.spark)),
				...opt("tone", enu(v.tone, HERO_TONES))
			};
		}
		case "stat": {
			const label = str(v.label, GENUI_LIMITS.maxString);
			const value = str(v.value, 128);
			if (label === void 0 || value === void 0) return null;
			return {
				type: "stat",
				label,
				value,
				...opt("delta", str(v.delta, 64)),
				...opt("spark", sparkValues(v.spark)),
				...opt("size", v.size === "hero" ? "hero" : void 0)
			};
		}
		case "progress": {
			const value = num(v.value, 0, 100);
			if (value === void 0) return null;
			return {
				type: "progress",
				value,
				...opt("label", str(v.label, GENUI_LIMITS.maxString)),
				...opt("valueLabel", str(v.valueLabel, 64)),
				...opt("variant", enu(v.variant, PROGRESS_VARIANTS)),
				...opt("target", num(v.target, 0, 100))
			};
		}
		case "divider": return {
			type: "divider",
			...opt("label", str(v.label, 64))
		};
		case "spacer": return { type: "spacer" };
		case "avatar": {
			const name = str(v.name, 64);
			if (name === void 0) return null;
			return {
				type: "avatar",
				name,
				...opt("color", color(v.color))
			};
		}
		case "list": {
			const items = repairListItems(v.items, GENUI_LIMITS.maxListItems, ctx, depth + 1);
			if (items === void 0) return null;
			return {
				type: "list",
				items,
				...opt("filter", str(v.filter, 64))
			};
		}
		case "table": {
			const prepared = prepareTableRows(v);
			if (prepared === null) return null;
			const { columns, rows } = prepared;
			const rawTypes = Array.isArray(v.types) ? v.types : void 0;
			const types = rawTypes === void 0 ? void 0 : columns.map((_c, i) => {
				const raw = rawTypes[i];
				return typeof raw === "string" && TABLE_CELL_TYPES.includes(raw) ? raw : "text";
			});
			const rawDetails = Array.isArray(v.details) ? v.details : void 0;
			const details = rawDetails === void 0 ? void 0 : rows.map((_row, i) => {
				if (!isTableDetailReachable({
					columns,
					rows,
					types
				}, i)) return null;
				const entry = repairItems(rawDetails[i], ctx, depth + 1);
				return entry.length === 0 ? null : entry;
			});
			return {
				type: "table",
				columns,
				rows,
				...opt("types", types),
				...opt("total", v.total === true ? true : void 0),
				...opt("export", v.export === true ? true : void 0),
				...opt("filter", str(v.filter, 64)),
				...opt("filterColumn", int(v.filterColumn, 0, GENUI_LIMITS.maxTableCols - 1)),
				...opt("sortField", str(v.sortField, 64)),
				...opt("details", details !== void 0 && details.some((d) => d !== null) ? details : void 0)
			};
		}
		case "chart": {
			const data = repairChartData(v.data, GENUI_LIMITS.maxChartPoints);
			const series = Array.isArray(v.series) ? repairSeries(v.series, GENUI_LIMITS.maxPlotSeries, GENUI_LIMITS.maxChartPoints) : void 0;
			if (data === void 0 && series === void 0) return null;
			return {
				type: "chart",
				data: data ?? [],
				...opt("title", str(v.title, GENUI_LIMITS.maxString)),
				...opt("kind", enu(v.kind, CHART_KINDS)),
				...opt("series", series),
				...opt("horizontal", v.horizontal === true ? true : void 0),
				...opt("stacked", v.stacked === true ? true : void 0),
				...opt("filter", str(v.filter, 64)),
				...opt("palette", paletteValues(v.palette))
			};
		}
		case "tabs": {
			const tabs = repairTabs(v.tabs, ctx, depth);
			if (tabs === void 0) return null;
			return {
				type: "tabs",
				tabs
			};
		}
		case "plot": {
			const series = repairPlotSeries(v.series, GENUI_LIMITS.maxPlotSeries);
			if (series === void 0) return null;
			return {
				type: "plot",
				series,
				...opt("xMin", num(v.xMin, -1e6, 1e6)),
				...opt("xMax", num(v.xMax, -1e6, 1e6)),
				...opt("yMin", num(v.yMin, -1e9, 1e9)),
				...opt("yMax", num(v.yMax, -1e9, 1e9)),
				...opt("title", str(v.title, GENUI_LIMITS.maxString))
			};
		}
		case "callout": {
			const content = str(v.content, GENUI_LIMITS.maxString);
			if (content === void 0) return null;
			return {
				type: "callout",
				content,
				...opt("tone", enu(v.tone, CALLOUT_TONES)),
				...opt("title", str(v.title, GENUI_LIMITS.maxString))
			};
		}
		case "steps": {
			const steps = repairSteps(v.steps);
			if (steps === void 0) return null;
			return {
				type: "steps",
				steps,
				...opt("current", int(v.current, 0, steps.length))
			};
		}
		case "keyvalue": {
			const pairs = repairPairs(v.pairs, GENUI_LIMITS.maxKeyValuePairs);
			if (pairs === void 0) return null;
			return {
				type: "keyvalue",
				pairs
			};
		}
		case "diff": {
			const diffs = repairDiffs(v.diffs);
			if (diffs === void 0) return null;
			return {
				type: "diff",
				diffs
			};
		}
		case "json":
			if (!("value" in v)) return null;
			return {
				type: "json",
				value: v.value
			};
		case "code": {
			const code = str(v.code, GENUI_LIMITS.maxCode);
			if (code === void 0) return null;
			return {
				type: "code",
				code,
				...opt("lang", str(v.lang, 64))
			};
		}
		case "radio": {
			const options = repairStrings(v.options, GENUI_LIMITS.maxOptions, GENUI_LIMITS.maxString);
			if (options === void 0) return null;
			return {
				type: "radio",
				options,
				...opt("label", str(v.label, GENUI_LIMITS.maxString)),
				...opt("selected", int(v.selected, 0, options.length - 1)),
				...opt("action", str(v.action, 200)),
				...opt("group", str(v.group, 200)),
				...opt("answer", typeof v.answer === "number" && Number.isFinite(v.answer) && v.answer >= 0 && v.answer < options.length ? Math.trunc(v.answer) : typeof v.answer === "string" ? v.answer.slice(0, 512) : void 0),
				...opt("explanation", str(v.explanation, GENUI_LIMITS.maxString))
			};
		}
		case "submit": {
			const label = str(v.label, GENUI_LIMITS.maxString);
			const action = str(v.action, 200);
			if (label === void 0) return null;
			return {
				type: "submit",
				label,
				...opt("action", action),
				...opt("resetAction", str(v.resetAction, 200)),
				...opt("groups", repairStrings(v.groups, GENUI_LIMITS.maxOptions, 200))
			};
		}
		case "switch": {
			const label = str(v.label, GENUI_LIMITS.maxString);
			if (label === void 0) return null;
			return {
				type: "switch",
				label,
				...opt("checked", v.checked === true ? true : void 0),
				...opt("action", str(v.action, 200))
			};
		}
		case "slider": {
			const min = num(v.min, -1e9, 1e9) ?? 0;
			const max = num(v.max, -1e9, 1e9) ?? 100;
			const lo = Math.min(min, max);
			const hi = Math.max(min, max);
			const step = num(v.step, 1e-9, Math.max(hi - lo, 1e-9));
			const value = num(v.value, lo, hi) ?? lo;
			return {
				type: "slider",
				min: lo,
				max: hi,
				...opt("step", step),
				value,
				...opt("label", str(v.label, GENUI_LIMITS.maxString)),
				...opt("action", str(v.action, 200)),
				...opt("id", str(v.id, 200))
			};
		}
		case "textarea": return {
			type: "textarea",
			...opt("label", str(v.label, GENUI_LIMITS.maxString)),
			...opt("placeholder", str(v.placeholder, GENUI_LIMITS.maxString)),
			...opt("rows", int(v.rows, 1, 30)),
			...opt("value", str(v.value, GENUI_LIMITS.maxString)),
			...opt("action", str(v.action, 200)),
			...opt("id", str(v.id, 200))
		};
		case "accordion": {
			const items = repairAccordion(v.items, ctx, depth);
			if (items === void 0) return null;
			return {
				type: "accordion",
				items
			};
		}
		case "copy": {
			const text = str(v.text, GENUI_LIMITS.maxCode);
			if (text === void 0) return null;
			return {
				type: "copy",
				text,
				...opt("label", str(v.label, 128)),
				...opt("expandable", typeof v.expandable === "boolean" ? v.expandable : void 0),
				...opt("previewLines", int(v.previewLines, 0, GENUI_LIMITS.maxCopyPreviewLines))
			};
		}
		case "svg": {
			const code = str(v.code, GENUI_LIMITS.maxCode);
			if (code === void 0) return null;
			return {
				type: "svg",
				code,
				...opt("title", str(v.title, GENUI_LIMITS.maxString)),
				...opt("height", int(v.height, 100, 800))
			};
		}
		case "mermaid": {
			const code = str(v.code, GENUI_LIMITS.maxMermaid);
			if (code === void 0) return null;
			return {
				type: "mermaid",
				code
			};
		}
		case "scene3d": {
			const meshes = repairMeshes(v.meshes);
			if (meshes === void 0) return null;
			return {
				type: "scene3d",
				meshes,
				...opt("title", str(v.title, GENUI_LIMITS.maxString)),
				...opt("ambient", num(v.ambient, 0, 2)),
				...opt("background", color(v.background))
			};
		}
		case "diagram": return repairDiagram(v);
		case "timeline": {
			const items = repairTimeline(v.items, GENUI_LIMITS.maxTimelineItems);
			if (items === void 0) return null;
			return {
				type: "timeline",
				items
			};
		}
		case "file-tree": {
			const items = repairTree(v.items, GENUI_LIMITS.maxListItems);
			if (items === void 0) return null;
			return {
				type: "file-tree",
				items
			};
		}
		case "breadcrumb": {
			const items = repairStrings(v.items, GENUI_LIMITS.maxBreadcrumbItems, GENUI_LIMITS.maxString);
			if (items === void 0) return null;
			return {
				type: "breadcrumb",
				items
			};
		}
		case "quiz": {
			const question = str(v.question, GENUI_LIMITS.maxString);
			const options = repairQuizOptions(v.options, v.answer);
			if (question === void 0 || options === void 0) return null;
			return {
				type: "quiz",
				question,
				options,
				...opt("explanation", str(v.explanation, GENUI_LIMITS.maxString)),
				...opt("id", str(v.id, 200)),
				...opt("action", str(v.action, 200))
			};
		}
		case "echart": {
			const data = v.data !== void 0 ? repairChartData(v.data, GENUI_LIMITS.maxChartPoints) : void 0;
			const series = v.series !== void 0 && Array.isArray(v.series) ? repairSeries(v.series, GENUI_LIMITS.maxPlotSeries, GENUI_LIMITS.maxChartPoints) : void 0;
			const links = Array.isArray(v.links) ? v.links.slice(0, GENUI_LIMITS.maxChartPoints).flatMap((entry) => {
				const e = obj(entry);
				const from = e === void 0 ? void 0 : str(e.from, 64);
				const to = e === void 0 ? void 0 : str(e.to, 64);
				if (from === void 0 || to === void 0) return [];
				return [{
					from,
					to,
					...opt("value", num(e.value, 0, 1e9))
				}];
			}) : void 0;
			const sanitized = v.option !== void 0 ? sanitizeEChartOption(v.option, 0, { count: GENUI_LIMITS.maxEChartOptionNodes }) : void 0;
			const option = sanitized === void 0 || typeof sanitized !== "object" || sanitized === null || Array.isArray(sanitized) ? void 0 : sanitized;
			if (option === void 0 && data === void 0 && series === void 0 && (links === void 0 || links.length === 0)) return null;
			return {
				type: "echart",
				...opt("title", str(v.title, GENUI_LIMITS.maxString)),
				...opt("height", int(v.height, 100, 800)),
				...opt("preset", enu(v.preset, ECHART_PRESETS)),
				...opt("data", data),
				...opt("series", series),
				...opt("links", links !== void 0 && links.length > 0 ? links : void 0),
				...opt("palette", paletteValues(v.palette)),
				...opt("option", option)
			};
		}
		default: return value;
	}
}
function repairStrings(v, cap, strCap) {
	if (!Array.isArray(v)) return void 0;
	const out = [];
	for (const item of v) {
		if (out.length >= cap) break;
		if (typeof item === "string") out.push(item.slice(0, strCap));
		else if (item !== null && typeof item === "object") {
			const o = item;
			const s = typeof o.label === "string" ? o.label : typeof o.value === "string" ? o.value : typeof o.title === "string" ? o.title : JSON.stringify(item);
			out.push(s.slice(0, strCap));
		}
	}
	return out;
}
function repairListItems(v, cap, ctx, depth) {
	if (!Array.isArray(v)) return void 0;
	const out = [];
	for (const item of v) {
		if (out.length >= cap) break;
		if (typeof item === "string") {
			out.push(item.slice(0, GENUI_LIMITS.maxString));
			continue;
		}
		const o = obj(item);
		if (o !== void 0 && typeof o.type === "string") {
			if (ctx.remaining <= 0) break;
			ctx.remaining -= 1;
			const node = repairNode(o, ctx, depth);
			if (node !== null) out.push(node);
			continue;
		}
		const title = o === void 0 ? void 0 : str(o.title, GENUI_LIMITS.maxString);
		if (title !== void 0) out.push({
			title,
			...opt("desc", str(o?.desc, GENUI_LIMITS.maxString))
		});
	}
	return out;
}
function repairChartData(v, cap) {
	if (!Array.isArray(v)) return void 0;
	const out = [];
	for (const datum of v) {
		if (out.length >= cap) break;
		const o = obj(datum);
		const label = o === void 0 ? void 0 : str(o.label, 128);
		const value = o === void 0 ? void 0 : num(o.value, -0xe8d4a51000, 0xe8d4a51000);
		if (label === void 0 || value === void 0) continue;
		out.push({
			label,
			value,
			...opt("color", o === void 0 ? void 0 : color(o.color))
		});
	}
	return out;
}
function repairSeries(v, cap, pointCap) {
	if (!Array.isArray(v)) return void 0;
	const out = [];
	for (const s of v) {
		if (out.length >= cap) break;
		const o = obj(s);
		const label = o === void 0 ? void 0 : str(o.label, 128);
		const data = o === void 0 ? void 0 : repairChartData(o.data, pointCap);
		if (label === void 0 || data === void 0) continue;
		out.push({
			label,
			data,
			...opt("color", o === void 0 ? void 0 : color(o.color))
		});
	}
	return out;
}
function repairTabs(v, ctx, depth) {
	if (!Array.isArray(v)) return void 0;
	const out = [];
	for (const tab of v) {
		if (out.length >= GENUI_LIMITS.maxTabs) break;
		const o = obj(tab);
		const label = o === void 0 ? void 0 : str(o.label, 128);
		if (label === void 0 || o === void 0) continue;
		const rawItems = o.items !== void 0 ? o.items : o.content !== void 0 ? Array.isArray(o.content) ? o.content : [o.content] : void 0;
		out.push({
			label,
			items: repairItems(rawItems, ctx, depth + 1)
		});
	}
	return out;
}
function repairPlotSeries(v, cap) {
	if (!Array.isArray(v)) return void 0;
	const out = [];
	for (const s of v) {
		if (out.length >= cap) break;
		const o = obj(s);
		const expr = o === void 0 ? void 0 : str(o.expr, 512);
		if (expr === void 0 || o === void 0) continue;
		const params = [];
		if (Array.isArray(o.params)) for (const p of o.params) {
			if (params.length >= GENUI_LIMITS.maxPlotParams) break;
			const po = obj(p);
			const name = po === void 0 ? void 0 : str(po.name, 64);
			const value = po === void 0 ? void 0 : num(po.value, -1e9, 1e9);
			if (name === void 0 || value === void 0) continue;
			params.push({
				name,
				value,
				...opt("min", po === void 0 ? void 0 : num(po.min, -1e9, 1e9)),
				...opt("max", po === void 0 ? void 0 : num(po.max, -1e9, 1e9)),
				...opt("step", po === void 0 ? void 0 : num(po.step, 1e-9, 1e9)),
				...opt("animateTo", po === void 0 ? void 0 : num(po.animateTo, -1e9, 1e9)),
				...opt("durationMs", po === void 0 ? void 0 : num(po.durationMs, 1, 12e4)),
				...opt("loop", po === void 0 ? void 0 : po.loop === true ? true : void 0)
			});
		}
		out.push({
			expr,
			...opt("label", str(o.label, 128)),
			...opt("color", color(o.color)),
			...opt("kind", enu(o.kind, PLOT_KINDS)),
			...opt("params", params.length > 0 ? params : void 0)
		});
	}
	return out;
}
function repairSteps(v) {
	if (!Array.isArray(v)) return void 0;
	const out = [];
	for (const s of v) {
		if (out.length >= GENUI_LIMITS.maxSteps) break;
		const o = obj(s);
		const title = o === void 0 ? void 0 : str(o.title, 256);
		if (title === void 0) continue;
		out.push({
			title,
			...opt("desc", o === void 0 ? void 0 : str(o.desc, GENUI_LIMITS.maxString))
		});
	}
	return out;
}
function repairPairs(v, cap) {
	if (!Array.isArray(v)) return void 0;
	const out = [];
	for (const p of v) {
		if (out.length >= cap) break;
		const o = obj(p);
		const key = o === void 0 ? void 0 : str(o.key, 256);
		const value = o === void 0 ? void 0 : str(o.value, GENUI_LIMITS.maxString);
		if (key === void 0 || value === void 0) continue;
		out.push({
			key,
			value
		});
	}
	return out;
}
function repairDiffs(v) {
	if (!Array.isArray(v)) return void 0;
	const out = [];
	for (const d of v) {
		if (out.length >= 24) break;
		const o = obj(d);
		const path = o === void 0 ? void 0 : str(o.path, 1024);
		const newText = o === void 0 ? void 0 : str(o.newText, 2e4);
		if (path === void 0 || newText === void 0) continue;
		const old = o === void 0 ? void 0 : o.oldText;
		out.push({
			path,
			newText,
			oldText: old === null || typeof old !== "string" ? null : old.slice(0, 2e4)
		});
	}
	return out;
}
function repairAccordion(v, ctx, depth) {
	if (!Array.isArray(v)) return void 0;
	const out = [];
	for (const item of v) {
		if (out.length >= GENUI_LIMITS.maxAccordionItems) break;
		const o = obj(item);
		const title = o === void 0 ? void 0 : str(o.title, 256);
		if (title === void 0 || o === void 0) continue;
		out.push({
			title,
			items: repairItems(o.items, ctx, depth + 1)
		});
	}
	return out;
}
function repairMeshes(v) {
	if (!Array.isArray(v)) return void 0;
	const out = [];
	for (const m of v) {
		if (out.length >= GENUI_LIMITS.maxMeshes) break;
		const o = obj(m);
		const shape = o === void 0 ? void 0 : enu(o.shape, MESH_SHAPES);
		if (shape === void 0) continue;
		const scale = o === void 0 ? void 0 : num(o.scale, -1e6, 1e6) ?? tuple3(o.scale);
		const size = o === void 0 ? void 0 : num(o.size, -1e6, 1e6) ?? tuple3(o.size);
		out.push({
			shape,
			...opt("color", o === void 0 ? void 0 : color(o.color)),
			...opt("position", o === void 0 ? void 0 : tuple3(o.position)),
			...opt("rotation", o === void 0 ? void 0 : tuple3(o.rotation)),
			...opt("scale", scale),
			...opt("size", size)
		});
	}
	return out;
}
function tuple3(v) {
	if (!Array.isArray(v) || v.length !== 3) return void 0;
	const [a, b, c] = v;
	if (typeof a !== "number" || !Number.isFinite(a) || typeof b !== "number" || !Number.isFinite(b) || typeof c !== "number" || !Number.isFinite(c)) return void 0;
	return [
		Math.min(1e6, Math.max(-1e6, a)),
		Math.min(1e6, Math.max(-1e6, b)),
		Math.min(1e6, Math.max(-1e6, c))
	];
}
/** Clamp a coordinate/size to the 4px editorial grid. */
function grid4(v, min, max) {
	return Math.min(max, Math.max(min, Math.round(v / 4) * 4));
}
function repairDiagramNodes(v) {
	if (!Array.isArray(v)) return void 0;
	const out = [];
	const seen = /* @__PURE__ */ new Set();
	for (const raw of v) {
		if (out.length >= GENUI_LIMITS.maxDiagramNodes) break;
		const o = obj(raw);
		if (o === void 0) continue;
		const id = str(o.id, 128);
		const label = str(o.label, GENUI_LIMITS.maxString);
		if (id === void 0 || label === void 0) continue;
		if (seen.has(id)) continue;
		seen.add(id);
		const nodeType = enu(o.type, DIAGRAM_NODE_TYPES);
		const x = o.x === void 0 ? void 0 : grid4(num(o.x, -1e6, 1e6) ?? 0, 0, 1e6);
		const y = o.y === void 0 ? void 0 : grid4(num(o.y, -1e6, 1e6) ?? 0, 0, 1e6);
		const w = o.w === void 0 ? void 0 : grid4(num(o.w, -1e6, 1e6) ?? 96, 40, 2e3);
		const h = o.h === void 0 ? void 0 : grid4(num(o.h, -1e6, 1e6) ?? 48, 24, 1200);
		out.push({
			id,
			label,
			...opt("sub", str(o.sub, 256)),
			...opt("type", nodeType),
			...opt("x", x),
			...opt("y", y),
			...opt("w", w),
			...opt("h", h),
			...opt("tag", str(o.tag, 32))
		});
	}
	return out;
}
function repairDiagramEdges(v) {
	if (v === void 0) return [];
	if (!Array.isArray(v)) return void 0;
	const out = [];
	for (const raw of v) {
		if (out.length >= GENUI_LIMITS.maxDiagramEdges) break;
		const o = obj(raw);
		if (o === void 0) continue;
		const from = str(o.from, 128);
		const to = str(o.to, 128);
		if (from === void 0 || to === void 0) continue;
		out.push({
			from,
			to,
			...opt("label", str(o.label, GENUI_LIMITS.maxDiagramLabel)),
			...opt("kind", enu(o.kind, DIAGRAM_EDGE_KINDS)),
			...opt("route", enu(o.route, DIAGRAM_ROUTES))
		});
	}
	return out;
}
function repairDiagramTheme(v) {
	const o = obj(v);
	if (o === void 0) return void 0;
	const out = {};
	for (const key of [
		"paper",
		"paper-2",
		"ink",
		"muted",
		"soft",
		"rule",
		"accent",
		"accent-tint",
		"link"
	]) {
		const c = color(o[key]);
		if (c !== void 0) out[key] = c;
	}
	return Object.keys(out).length === 0 ? void 0 : out;
}
function repairDiagramZones(v) {
	if (v === void 0) return [];
	if (!Array.isArray(v)) return void 0;
	const out = [];
	for (const raw of v) {
		if (out.length >= GENUI_LIMITS.maxDiagramZones) break;
		const o = obj(raw);
		if (o === void 0) continue;
		const label = str(o.label, 64);
		if (label === void 0) continue;
		out.push({
			label,
			...opt("x", o.x === void 0 ? void 0 : grid4(num(o.x, -1e6, 1e6) ?? 0, 0, 1e6)),
			...opt("y", o.y === void 0 ? void 0 : grid4(num(o.y, -1e6, 1e6) ?? 0, 0, 1e6)),
			...opt("w", o.w === void 0 ? void 0 : grid4(num(o.w, -1e6, 1e6) ?? 100, 40, 2e3)),
			...opt("h", o.h === void 0 ? void 0 : grid4(num(o.h, -1e6, 1e6) ?? 100, 40, 1200))
		});
	}
	return out;
}
function repairDiagram(v) {
	const o = obj(v);
	if (o === void 0) return null;
	const kind = enu(o.kind, DIAGRAM_KINDS);
	if (kind === void 0) return null;
	const nodes = repairDiagramNodes(o.nodes);
	if (nodes === void 0) return null;
	const edges = repairDiagramEdges(o.edges);
	if (edges === void 0) return null;
	const zones = repairDiagramZones(o.zones);
	if (zones === void 0) return null;
	return {
		type: "diagram",
		kind,
		nodes,
		edges,
		...opt("zones", zones.length > 0 ? zones : void 0),
		...opt("variant", enu(o.variant, DIAGRAM_VARIANTS)),
		...opt("title", str(o.title, 256)),
		...opt("theme", repairDiagramTheme(o.theme))
	};
}
function repairTimeline(v, cap) {
	if (!Array.isArray(v)) return void 0;
	const out = [];
	for (const item of v) {
		if (out.length >= cap) break;
		const o = obj(item);
		const title = o === void 0 ? void 0 : str(o.title, 256);
		if (title === void 0) continue;
		out.push({
			title,
			...opt("desc", o === void 0 ? void 0 : str(o.desc, GENUI_LIMITS.maxString)),
			...opt("time", o === void 0 ? void 0 : str(o.time, 128))
		});
	}
	return out;
}
function repairTree(v, cap) {
	return walkTree(v, cap, GENUI_LIMITS.maxTreeDepth);
}
function walkTree(v, cap, depthLeft) {
	if (!Array.isArray(v)) return void 0;
	const out = [];
	for (const item of v) {
		if (out.length >= cap) break;
		const o = obj(item);
		const name = o === void 0 ? void 0 : str(o.name, 256);
		if (name === void 0) continue;
		const children = o !== void 0 && depthLeft > 0 && Array.isArray(o.children) ? walkTree(o.children, cap, depthLeft - 1) : void 0;
		out.push({
			name,
			...opt("type", o === void 0 ? void 0 : enu(o.type, FILE_TYPES)),
			...opt("children", children)
		});
	}
	return out;
}
function repairQuizOptions(v, answer) {
	if (!Array.isArray(v)) return void 0;
	const out = [];
	for (const optItem of v) {
		if (out.length >= GENUI_LIMITS.maxQuizOptions) break;
		const o = obj(optItem);
		const label = typeof optItem === "string" ? str(optItem, 512) : o === void 0 ? void 0 : str(o.label, 512);
		if (label === void 0) continue;
		out.push({
			label,
			...opt("correct", o === void 0 ? void 0 : o.correct === true ? true : void 0),
			...opt("feedback", o === void 0 ? void 0 : str(o.feedback, GENUI_LIMITS.maxString))
		});
	}
	if (out.length === 0) return void 0;
	if (out.some((option) => option.correct === true)) return out;
	const answerIndex = typeof answer === "number" && Number.isFinite(answer) ? Math.trunc(answer) : typeof answer === "string" ? out.findIndex((option) => option.label === answer.slice(0, 512)) : -1;
	if (answerIndex < 0 || answerIndex >= out.length) return out;
	return out.map((option, index) => index === answerIndex ? {
		...option,
		correct: true
	} : option);
}
/**
* Patterns that indicate HTML/script injection in a string field. ECharts
* default `tooltip.renderMode: 'html'` writes tooltip content via
* `innerHTML`; even with renderMode forced to 'richText' (see below),
* filtering these patterns is defense-in-depth — a model (or a
* prompt-injected model) should never emit `<script>`, `onerror=`, or
* `javascript:` inside a chart option string.
*/
const ECHART_HTML_DANGER_RE = /<(?:script|img|svg|iframe|video|audio|object|embed|source)\b|on[a-z]+\s*=|javascript:/i;
/**
* Sanitize an ECharts option object: depth-bounded, budget-bounded
* pass-through that strips dangerous values (functions, `url()` in styles,
* HTML/script injection patterns in strings) but preserves the object shape
* ECharts needs. Scalars are KEPT: ECharts options are full of them,
* including inside `data` arrays (`data: [120, 150, 180]`,
* `xAxis.data: ['1月', '2月']`). Previously a scalar hit the plain-object
* gate below and returned undefined, so every primitive-valued array was
* filtered to empty and dropped — a chart with a full `option` rendered
* with empty series (blank canvas). This is a safety walk, not an ECharts
* semantic validator.
*
* Security: `tooltip.renderMode` is forced to `'richText'` on every tooltip
* object. ECharts' default `'html'` mode writes tooltip content via
* `innerHTML`, which is an XSS vector when the option originates from model
* output — a prompt-injected model could emit
* `{"tooltip":{"formatter":"<img src=x onerror=...>"}}` and execute
* arbitrary script. `richText` renders as text, never touching innerHTML.
*/
function sanitizeEChartOption(v, depth, budget) {
	if (budget.count <= 0) return void 0;
	budget.count -= 1;
	if (depth > GENUI_LIMITS.maxEChartOptionDepth) return void 0;
	if (typeof v === "string") {
		const s = v.slice(0, GENUI_LIMITS.maxString);
		if (s.toLowerCase().includes("url(") || ECHART_HTML_DANGER_RE.test(s)) return void 0;
		return s;
	}
	if (typeof v === "number" && Number.isFinite(v)) return v;
	if (typeof v === "boolean") return v;
	if (v === null) return null;
	if (Array.isArray(v)) {
		const cap = Math.min(v.length, GENUI_LIMITS.maxEChartArrayLen);
		const arr = [];
		for (let i = 0; i < cap; i++) {
			const s = sanitizeEChartOption(v[i], depth + 1, budget);
			if (s !== void 0) arr.push(s);
		}
		return arr.length > 0 || v.length === 0 ? arr : void 0;
	}
	const o = obj(v);
	if (o === void 0) return void 0;
	const out = {};
	for (const [key, val] of Object.entries(o)) {
		const s = sanitizeEChartOption(val, depth + 1, budget);
		if (s === void 0) continue;
		if (key === "tooltip" && typeof s === "object" && s !== null && !Array.isArray(s)) s.renderMode = "richText";
		out[key] = s;
	}
	return Object.keys(out).length > 0 || Object.keys(o).length === 0 ? out : void 0;
}
/**
* Deterministically repair a raw spec value into a renderable GenuiSpec.
* Returns null only when the root is not an object with an `items` array
* (a bare component root is wrapped into a col first — the documented fence
* vocabulary allows single-component bodies); every other defect is healed by
* dropping/clamping/truncating. Idempotent: repairing a repaired spec is a
* no-op.
*/
function repairCanonicalGenuiSpec(value) {
	const v = obj(value);
	if (v === void 0) return null;
	if (isComponentRoot(value)) {
		const wrapped = wrapSingleComponentRoot(value);
		if (wrapped === null) return null;
		return repairCanonicalGenuiSpec(wrapped);
	}
	if (!Array.isArray(v.items)) return null;
	const ctx = { remaining: GENUI_LIMITS.maxNodes };
	return {
		...opt("title", str(v.title, GENUI_LIMITS.maxString)),
		...opt("gap", num(v.gap, 0, 96)),
		...opt("panel", v.panel === true ? true : void 0),
		...opt("append", v.append === true ? true : void 0),
		items: repairItems(v.items, ctx, 0)
	};
}
/**
* Count the nodes of a spec tree (every item, descending into tabs /
* accordion / file-tree / list containers — the same descent
* `validateGenuiSpec` walks). Shared by the panel fold (node-budget gate)
* and validation, so the panel never runs a second, divergent traversal.
* `cap` bounds the walk for hostile inputs; the panel passes
* `PANEL_LIMITS.maxNodes + 1` to detect overflow without counting the whole
* tree.
*/
function countGenuiNodes(value, cap = Number.POSITIVE_INFINITY) {
	let count = 0;
	const walk = (list) => {
		if (!Array.isArray(list)) return;
		for (const item of list) {
			if (count >= cap) return;
			count += 1;
			const v = obj(item);
			if (v === void 0) continue;
			if (v.type === "tabs" && Array.isArray(v.tabs)) for (const t of v.tabs) {
				if (count >= cap) return;
				const to = obj(t);
				if (to !== void 0) walk(to.items);
			}
			else if (v.type === "accordion" && Array.isArray(v.items)) for (const it of v.items) {
				if (count >= cap) return;
				const io = obj(it);
				if (io !== void 0) walk(io.items);
			}
			else if ((v.type === "row" || v.type === "col" || v.type === "grid" || v.type === "card") && Array.isArray(v.items)) walk(v.items);
			else if (v.type === "file-tree") {} else if (v.type === "list" && Array.isArray(v.items)) for (const li of v.items) {
				if (count >= cap) return;
				const lo = obj(li);
				if (lo !== void 0 && typeof lo.type === "string") walk([lo]);
			}
			else if (v.type === "table" && Array.isArray(v.details)) {
				const rowCount = tableRowsForDetails(v).length;
				for (let rowIndex = 0; rowIndex < Math.min(v.details.length, rowCount); rowIndex++) {
					if (count >= cap) return;
					const detail = v.details[rowIndex];
					if (Array.isArray(detail) && isTableDetailReachable(v, rowIndex)) walk(detail);
				}
			}
		}
	};
	const root = obj(value);
	walk(root === void 0 ? [] : root.items);
	return count;
}
/** Every white-listed node `type`. Keep in sync with the repairNode switch —
* validate_dsh_ui uses it to tell declared GenUI nodes apart from unrelated
* `"type"` strings (e.g. file-tree's `{type:'file'}` children). */
const GENUI_NODE_TYPES = GENUI_NATIVE_TYPES;
/**
* Visit and count declared nodes in a raw spec tree: objects whose `type` is a
* white-listed string, descending the same containers `countGenuiNodes`
* walks. Callers can inspect field semantics or compare the count with the
* repaired tree without maintaining another traversal.
*
* With `familyCaps` (default) the traversal applies the same per-family
* policy caps repair enforces (tabs ≤ maxTabs, accordion items ≤
* maxAccordionItems): nodes beyond a cap are policy-truncated, not defects,
* so the declared-vs-rendered ledger must not count them as vanished (#298).
*/
function visitDeclaredGenuiNodes(value, cap, visit, options = {}) {
	const familyCaps = options.familyCaps !== false;
	let count = 0;
	const declared = (candidate) => {
		const o = obj(candidate);
		return o !== void 0 && typeof o.type === "string" && GENUI_NODE_TYPES.has(o.type);
	};
	function walk(list, path) {
		if (!Array.isArray(list)) return;
		for (let index = 0; index < list.length; index++) {
			walkNode(list[index], `${path}[${index}]`);
			if (count >= cap) return;
		}
	}
	function walkNode(item, at) {
		if (count >= cap || !declared(item)) return;
		const v = obj(item);
		if (v === void 0) return;
		count += 1;
		visit(v, at);
		if (v.type === "tabs" && Array.isArray(v.tabs)) {
			const tabCount = familyCaps ? Math.min(v.tabs.length, GENUI_LIMITS.maxTabs) : v.tabs.length;
			for (let tab = 0; tab < tabCount; tab++) walkItemsOf(v.tabs[tab], `${at}.tabs[${tab}]`);
		} else if (v.type === "accordion" && Array.isArray(v.items)) {
			const rowCount = familyCaps ? Math.min(v.items.length, GENUI_LIMITS.maxAccordionItems) : v.items.length;
			for (let row = 0; row < rowCount; row++) walkItemsOf(v.items[row], `${at}.items[${row}]`);
		} else if ((v.type === "row" || v.type === "col" || v.type === "grid" || v.type === "card") && Array.isArray(v.items)) walk(v.items, `${at}.items`);
		else if (v.type === "list" && Array.isArray(v.items)) for (let row = 0; row < v.items.length; row++) walkNode(v.items[row], `${at}.items[${row}]`);
		else if (v.type === "table" && Array.isArray(v.details)) {
			const rowCount = tableRowsForDetails(v).length;
			for (let row = 0; row < Math.min(v.details.length, rowCount); row++) if (Array.isArray(v.details[row]) && isTableDetailReachable(v, row)) walk(v.details[row], `${at}.details[${row}]`);
		}
	}
	function walkItemsOf(holder, path) {
		const o = obj(holder);
		if (o === void 0) return;
		const items = o.items !== void 0 ? o.items : o.content;
		if (Array.isArray(items)) walk(items, `${path}.items`);
		else walkNode(items, `${path}.items`);
	}
	const root = obj(value);
	if (root === void 0) return count;
	if (isComponentRoot(root) && declared(value)) walkNode(value, "spec");
	else walk(root.items, "items");
	return count;
}
/**
* Count white-listed nodes declared by a raw spec before repair drops invalid entries.
* @param value - raw GenUI spec.
* @param cap - traversal ceiling.
* @param options - `familyCaps: false` counts beyond per-family policy caps too.
* @returns declared node count up to the ceiling.
*/
function countDeclaredGenuiNodes(value, cap = Number.POSITIVE_INFINITY, options = {}) {
	return visitDeclaredGenuiNodes(value, cap, () => {}, options);
}
/** Count native nodes that survived repair, excluding opaque custom nodes. */
function countRenderedNativeGenuiNodes(value, cap = Number.POSITIVE_INFINITY) {
	return countDeclaredGenuiNodes(value, cap);
}
/**
* Validate a raw spec value against the white list and limits, collecting
* human-readable problems. Unlike repair this never mutates: it is a
* diagnostic for tests and tooling. Unknown `type`s are reported (a plugin
* custom type is valid only when a renderer is registered — the guard cannot
* know, so it flags them as warnings).
*
* @param value - 未经过别名转换的 GenUI 文档。
* @returns 完整结构与字段校验结果。
*/
function validateCanonicalGenuiSpec(value) {
	const errors = [];
	const v = obj(value);
	if (v === void 0) return {
		ok: false,
		errors: ["spec root must be an object"]
	};
	if (isComponentRoot(value)) {
		const wrapped = wrapSingleComponentRoot(value);
		if (wrapped !== null) return validateCanonicalGenuiSpec(wrapped);
		return {
			ok: false,
			errors: ["spec.items must be an array"]
		};
	}
	if (!Array.isArray(v.items)) return {
		ok: false,
		errors: ["spec.items must be an array"]
	};
	validateSchemaFieldKinds(v, "spec", GENUI_SPEC_SCHEMA, errors, ["items"]);
	let count = 0;
	let capped = false;
	const walk = (list, depth, path) => {
		if (capped) return;
		if (!Array.isArray(list)) {
			errors.push(`${path} must be an array`);
			return;
		}
		for (let i = 0; i < list.length; i++) {
			if (capped || count >= GENUI_LIMITS.maxNodes) {
				if (!capped) {
					errors.push(`spec exceeds ${GENUI_LIMITS.maxNodes} nodes; tail elided`);
					capped = true;
				}
				return;
			}
			count += 1;
			const at = `${path}[${i}]`;
			validateNode(list[i], depth, at, errors, walk);
		}
	};
	walk(v.items, 0, "items");
	if (errors.length === 0) errors.push(...analyzeSubmissionRegistry(v).diagnostics);
	const uniqueErrors = [...new Set(errors)];
	return {
		ok: uniqueErrors.length === 0,
		errors: uniqueErrors
	};
}
/**
* Run the shared canonical GenUI pipeline.
*
* The pipeline normalizes aliases, applies the existing deterministic repair
* and security filters, validates the canonical input, and reports native
* declarations that disappeared during repair. Custom nodes stay opaque and
* do not participate in native unknown-field diagnostics.
*
* @param value - Raw GenUI spec or bare component.
* @returns Canonical input, repaired output, diagnostics, and node counts.
*/
function processGenuiSpec(value) {
	const normalized = normalizeGenuiSpec(value);
	const repaired = repairCanonicalGenuiSpec(normalized.value);
	const validation = validateCanonicalGenuiSpec(normalized.value);
	const declaredNativeCount = countDeclaredGenuiNodes(normalized.value, GENUI_LIMITS.maxNodes + 1);
	const uncappedDeclaredCount = countDeclaredGenuiNodes(normalized.value, GENUI_LIMITS.maxNodes + 1, { familyCaps: false });
	const renderedNativeCount = repaired === null ? 0 : countRenderedNativeGenuiNodes(repaired);
	const renderedTotalCount = repaired === null ? 0 : countGenuiNodes(repaired);
	const errors = validation.errors.filter((error) => !error.includes(": unknown type "));
	if (repaired !== null && errors.length === 0) errors.push(...analyzeSubmissionRegistry(repaired).diagnostics);
	if (declaredNativeCount > renderedNativeCount) errors.push(`repair dropped ${declaredNativeCount - renderedNativeCount} declared native node(s): declared ${declaredNativeCount}, rendered ${renderedNativeCount}`);
	const warnings = [...normalized.warnings, ...diagnoseUnknownGenuiFields(normalized.value)];
	if (uncappedDeclaredCount > declaredNativeCount) warnings.push({
		kind: "truncated",
		path: "spec",
		message: `策略上限截断:${uncappedDeclaredCount - declaredNativeCount} 个声明节点超出 tabs ≤ ${GENUI_LIMITS.maxTabs} / accordion ≤ ${GENUI_LIMITS.maxAccordionItems} 的上限,未渲染;围栏照常渲染,重发时可拆分为多个组件`
	});
	return {
		value: normalized.value,
		normalized: normalized.value,
		repaired,
		spec: repaired,
		errors: [...new Set(errors)],
		warnings,
		declaredCount: declaredNativeCount,
		renderedCount: renderedTotalCount,
		declaredNativeCount,
		renderedNativeCount,
		renderedTotalCount
	};
}
/** Return whether the only process errors describe an intentional budget tail cut. */
function isIntentionalBudgetCut(processed) {
	return processed.errors.length > 0 && processed.errors.every((error) => error.startsWith("spec exceeds ") || error.startsWith("repair dropped ")) && processed.renderedNativeCount === GENUI_LIMITS.maxNodes && processed.declaredNativeCount === GENUI_LIMITS.maxNodes + 1;
}
/** Decide whether a repaired spec is safe to expose to any GenUI renderer. */
function isRenderableProcess(processed) {
	return processed.spec !== null && (processed.errors.length === 0 || isIntentionalBudgetCut(processed));
}
/** Longest node or aligned table-detail slot path a validation error points at. */
const DECLARED_NODE_PATH_RE = /^(items\[\d+\](?:\.(?:items\[\d+\]|tabs\[\d+\]\.items\[\d+\]|details\[\d+\](?:\[\d+\])?))*)/;
function errorNodePath(error) {
	const match = DECLARED_NODE_PATH_RE.exec(error);
	return match === null ? null : match[1] ?? null;
}
/** Where the node or table-detail slot at a validation path lives. */
function nodeSlotAt(root, path) {
	const steps = [...path.matchAll(/(?:^|\.)(items|tabs|details)\[(\d+)\]|\[(\d+)\]/g)];
	if (steps.length === 0 || steps[steps.length - 1][1] === "tabs") return void 0;
	let current = root;
	for (let i = 0; i < steps.length; i++) {
		const step = steps[i];
		const list = step[1] === void 0 ? current : obj(current)?.[step[1]];
		const index = Number(step[2] ?? step[3]);
		if (!Array.isArray(list) || index >= list.length) return void 0;
		if (i === steps.length - 1) return {
			array: list,
			index,
			preserveIndex: step[1] === "details"
		};
		current = list[index];
		if (current === void 0) return void 0;
	}
}
/** Deep-clone a JSON value for pruning; null when it cannot round-trip. */
function cloneJsonValue(value) {
	try {
		return obj(JSON.parse(JSON.stringify(value))) ?? null;
	} catch {
		return null;
	}
}
/**
* Best-effort repair for a spec whose strict validation failed: drop the
* declared nodes the errors point at and re-run the whole pipeline once.
*
* The fence channels call this after the strict gate refuses, so ONE bad
* component no longer degrades the whole fence to a code block — the
* behaviour the capability map documents ("坏节点静默丢弃…不会拖垮界面") and
* that validate_dsh_ui keeps diagnosing for the model. Bounded to a single
* retry: a second failing pass is a genuinely pathological tree and keeps
* today's full-fence fallback. Chart semantics stay protected the same way —
* an undrawable chart is DROPPED here, never repaired into a blank canvas.
*/
function partialRepairGenuiSpec(processed) {
	if (isRenderableProcess(processed)) return processed.spec;
	if (processed.spec === null) return null;
	const root = obj(processed.value);
	if (root === void 0) return null;
	const paths = /* @__PURE__ */ new Set();
	const overhangPaths = /* @__PURE__ */ new Set();
	for (const error of processed.errors) {
		if (error.startsWith("spec exceeds ")) continue;
		const nodePath = errorNodePath(error);
		if (nodePath === null) continue;
		if (error === `${nodePath}.details must not contain more entries than rows`) overhangPaths.add(nodePath);
		else paths.add(nodePath);
	}
	if (paths.size === 0 && overhangPaths.size === 0) return null;
	const pruned = cloneJsonValue(isComponentRoot(root) ? wrapSingleComponentRoot(root) : root);
	if (pruned === null) return null;
	const slots = [...paths].map((path) => nodeSlotAt(pruned, path)).filter((slot) => slot !== void 0);
	const overhangSlots = [...overhangPaths].map((path) => nodeSlotAt(pruned, path)).filter((slot) => slot !== void 0);
	for (const { array, index } of overhangSlots) {
		const table = obj(array[index]);
		if (table?.type === "table" && Array.isArray(table.details)) table.details.length = Math.min(table.details.length, tableRowsForDetails(table).length);
	}
	const byArray = /* @__PURE__ */ new Map();
	for (const { array, index, preserveIndex } of slots) {
		if (preserveIndex) {
			array[index] = null;
			continue;
		}
		const indexes = byArray.get(array);
		if (indexes === void 0) byArray.set(array, [index]);
		else indexes.push(index);
	}
	for (const [array, indexes] of byArray) {
		indexes.sort((a, b) => b - a);
		for (const index of indexes) array.splice(index, 1);
	}
	const retry = processGenuiSpec(pruned);
	if (!isRenderableProcess(retry) || retry.renderedNativeCount === 0) return null;
	return retry.spec;
}
function validateChartData(value, at, errors) {
	if (!Array.isArray(value)) return;
	for (let index = 0; index < value.length; index++) {
		const datum = obj(value[index]);
		const path = `${at}[${index}]`;
		if (datum === void 0) {
			errors.push(`${path} must be an object`);
			continue;
		}
		if (typeof datum.label !== "string") errors.push(`${path}.label must be a string`);
		if (typeof datum.value !== "number" || !Number.isFinite(datum.value)) errors.push(`${path}.value must be a finite number`);
		if (datum.color !== void 0 && typeof datum.color !== "string") errors.push(`${path}.color must be a string`);
	}
}
function validateChartSeries(value, at, errors) {
	if (!Array.isArray(value)) return;
	for (let index = 0; index < value.length; index++) {
		const series = obj(value[index]);
		const path = `${at}[${index}]`;
		if (series === void 0) {
			errors.push(`${path} must be an object`);
			continue;
		}
		if (typeof series.label !== "string") errors.push(`${path}.label must be a string`);
		if (series.color !== void 0 && typeof series.color !== "string") errors.push(`${path}.color must be a string`);
		if (!Array.isArray(series.data)) errors.push(`${path}.data must be an array`);
		validateChartData(series.data, `${path}.data`, errors);
	}
}
function validateChartNode(v, at, errors) {
	if (!Array.isArray(v.data) && !Array.isArray(v.series)) errors.push(`${at}: type 'chart' requires data or series (array)`);
	if (v.variant !== void 0) errors.push(`${at}.variant is unsupported; use kind`);
	if (v.data !== void 0 && !Array.isArray(v.data)) errors.push(`${at}.data must be an array`);
	if (v.series !== void 0 && !Array.isArray(v.series)) errors.push(`${at}.series must be an array`);
	if (v.kind !== void 0 && (typeof v.kind !== "string" || !CHART_KINDS.includes(v.kind))) errors.push(`${at}.kind must be bars, line, or donut`);
	const kind = v.kind === void 0 ? "bars" : v.kind;
	const series = Array.isArray(v.series) ? v.series : void 0;
	if (Array.isArray(v.data) && v.data.length === 0 && (series === void 0 || series.length === 0)) errors.push(`${at}.data must not be empty`);
	if (series !== void 0) {
		if (series.length === 0) errors.push(`${at}.series must not be empty`);
		if (kind === "donut") errors.push(`${at}.series is only supported for bars and line`);
		for (let index = 0; index < series.length; index++) {
			const entry = obj(series[index]);
			if (entry !== void 0 && Array.isArray(entry.data) && entry.data.length === 0) errors.push(`${at}.series[${index}].data must not be empty`);
		}
	}
	if (kind === "donut" && v.data === void 0) errors.push(`${at}.data is required for donut`);
	if (kind === "line" && v.data === void 0 && (series === void 0 || series.length === 0)) errors.push(`${at}.data is required for line (or provide series)`);
	validateChartData(v.data, `${at}.data`, errors);
	validateChartSeries(v.series, `${at}.series`, errors);
}
/** Validate table rows before repair can silently remove malformed cells. */
function validateTableRows(value, at, errors) {
	if (!Array.isArray(value)) return;
	for (let rowIndex = 0; rowIndex < value.length; rowIndex++) {
		const row = value[rowIndex];
		if (obj(row) !== void 0) continue;
		if (!Array.isArray(row)) {
			errors.push(`${at}[${rowIndex}] must be an array or object`);
			continue;
		}
		for (let cellIndex = 0; cellIndex < row.length; cellIndex++) {
			const cell = row[cellIndex];
			if (typeof cell !== "string" && (typeof cell !== "number" || !Number.isFinite(cell))) errors.push(`${at}[${rowIndex}][${cellIndex}] must be a string or finite number`);
		}
	}
}
function validateNode(value, depth, at, errors, walk) {
	if (depth > GENUI_LIMITS.maxDepth) {
		errors.push(`${at}: exceeds max depth ${GENUI_LIMITS.maxDepth}`);
		return;
	}
	const v = obj(value);
	if (v === void 0) {
		errors.push(`${at}: must be an object`);
		return;
	}
	const type = v.type;
	if (typeof type !== "string") {
		errors.push(`${at}: missing string 'type'`);
		return;
	}
	const isStr = (name) => {
		if (v[name] !== void 0 && typeof v[name] !== "string") errors.push(`${at}: '${name}' must be a string`);
	};
	const isNum = (name) => {
		if (v[name] !== void 0 && (typeof v[name] !== "number" || !Number.isFinite(v[name]))) errors.push(`${at}: '${name}' must be a finite number`);
	};
	switch (type) {
		case "text":
			if (typeof v.content !== "string" && typeof v.text !== "string") errors.push(`${at}: type 'text' requires content or text (string)`);
			isStr("content");
			isStr("text");
			break;
		case "row":
		case "col":
		case "card":
		case "grid":
			if (!Array.isArray(v.items)) errors.push(`${at}: type '${type}' requires items (array)`);
			walk(v.items, depth + 1, `${at}.items`);
			if (type === "grid") isNum("cols");
			break;
		case "button":
		case "checkbox":
		case "link":
		case "switch":
			if (typeof v.label !== "string") errors.push(`${at}: type '${type}' requires label (string)`);
			isStr("label");
			break;
		case "image":
		case "audio":
		case "video":
			if (typeof v.src !== "string") errors.push(`${at}: type '${type}' requires src (string)`);
			isStr("src");
			isStr("alt");
			if (type === "video") isStr("poster");
			break;
		case "slider":
			isStr("label");
			isNum("min");
			isNum("max");
			isNum("step");
			isNum("value");
			break;
		case "input":
		case "textarea":
			isStr("label");
			isStr("placeholder");
			isStr("value");
			break;
		case "select":
		case "radio":
			if (!Array.isArray(v.options)) errors.push(`${at}: type '${type}' requires options (array)`);
			break;
		case "submit":
			if (typeof v.label !== "string") errors.push(`${at}: type 'submit' requires label (string)`);
			break;
		case "badge":
			if (typeof v.label !== "string" && typeof v.text !== "string" && typeof v.value !== "string") errors.push(`${at}: type 'badge' requires label, text, or value (string)`);
			isStr("label");
			isStr("text");
			isStr("value");
			break;
		case "hero":
			if (typeof v.title !== "string") errors.push(`${at}: type 'hero' requires title (string)`);
			isStr("subtitle");
			break;
		case "stat":
			if (typeof v.label !== "string") errors.push(`${at}: type 'stat' requires label (string)`);
			if (typeof v.value !== "string") errors.push(`${at}: type 'stat' requires value (string)`);
			isStr("delta");
			break;
		case "progress":
			if (typeof v.value !== "number" || !Number.isFinite(v.value) || v.value < 0 || v.value > 100) errors.push(`${at}: type 'progress' requires value (number 0..100)`);
			isNum("value");
			break;
		case "avatar":
			if (typeof v.name !== "string") errors.push(`${at}: type 'avatar' requires name (string)`);
			break;
		case "list":
			if (!Array.isArray(v.items)) errors.push(`${at}: type 'list' requires items (array)`);
			if (Array.isArray(v.items)) for (let i = 0; i < v.items.length; i++) {
				const item = obj(v.items[i]);
				if (item !== void 0 && typeof item.type === "string") validateNode(item, depth + 1, `${at}.items[${i}]`, errors, walk);
			}
			break;
		case "table":
			if (!Array.isArray(v.columns) && !hasDerivableTableColumns(v)) errors.push(`${at}: type 'table' requires columns (array)`);
			if (!Array.isArray(v.rows)) errors.push(`${at}: type 'table' requires rows (array)`);
			if (v.types !== void 0 && !Array.isArray(v.types)) errors.push(`${at}.types must be an array of column cell types`);
			if (v.details !== void 0 && !Array.isArray(v.details)) errors.push(`${at}.details must be an array aligned with rows`);
			if (Array.isArray(v.details)) {
				const table = {
					columns: v.columns,
					rows: v.rows,
					types: v.types
				};
				const rowCount = tableRowsForDetails(table).length;
				if (v.details.length > rowCount) errors.push(`${at}.details must not contain more entries than rows`);
				for (let i = 0; i < Math.min(v.details.length, rowCount); i++) {
					const detail = v.details[i];
					if (detail === null || !isTableDetailReachable(table, i)) continue;
					if (!Array.isArray(detail)) {
						errors.push(`${at}.details[${i}] must be an array or null`);
						continue;
					}
					walk(detail, depth + 1, `${at}.details[${i}]`);
				}
			}
			validateTableRows(v.rows, `${at}.rows`, errors);
			break;
		case "chart":
			validateChartNode(v, at, errors);
			break;
		case "tabs":
			if (!Array.isArray(v.tabs)) errors.push(`${at}: type 'tabs' requires tabs (array)`);
			if (Array.isArray(v.tabs)) for (let i = 0; i < v.tabs.length; i++) {
				const t = obj(v.tabs[i]);
				if (t === void 0) {
					errors.push(`${at}.tabs[${i}] must be an object`);
					continue;
				}
				if (typeof t.label !== "string") errors.push(`${at}.tabs[${i}].label must be a string`);
				walk(t.items, depth + 1, `${at}.tabs[${i}].items`);
			}
			break;
		case "plot":
			if (!Array.isArray(v.series)) errors.push(`${at}: type 'plot' requires series (array)`);
			break;
		case "callout":
			if (typeof v.content !== "string") errors.push(`${at}: type 'callout' requires content (string)`);
			break;
		case "steps":
			if (!Array.isArray(v.steps)) errors.push(`${at}: type 'steps' requires steps (array)`);
			break;
		case "keyvalue":
			if (!Array.isArray(v.pairs)) errors.push(`${at}: type 'keyvalue' requires pairs (array)`);
			break;
		case "diff":
			if (!Array.isArray(v.diffs)) errors.push(`${at}: type 'diff' requires diffs (array)`);
			break;
		case "divider":
		case "spacer": break;
		case "json":
			if (!("value" in v)) errors.push(`${at}: type 'json' requires value`);
			break;
		case "code":
			if (typeof v.code !== "string") errors.push(`${at}: type 'code' requires code (string)`);
			break;
		case "accordion":
			if (!Array.isArray(v.items)) errors.push(`${at}: type 'accordion' requires items (array)`);
			if (Array.isArray(v.items)) for (let i = 0; i < v.items.length; i++) {
				const item = obj(v.items[i]);
				if (item === void 0) {
					errors.push(`${at}.items[${i}] must be an object`);
					continue;
				}
				if (typeof item.title !== "string") errors.push(`${at}.items[${i}].title must be a string`);
				walk(item.items, depth + 1, `${at}.items[${i}].items`);
			}
			break;
		case "copy":
			if (typeof v.text !== "string") errors.push(`${at}: type 'copy' requires text (string)`);
			break;
		case "svg":
			if (typeof v.code !== "string") errors.push(`${at}: type 'svg' requires code (string)`);
			isNum("height");
			break;
		case "mermaid":
			if (typeof v.code !== "string") errors.push(`${at}: type 'mermaid' requires code (string)`);
			break;
		case "scene3d":
			if (!Array.isArray(v.meshes)) errors.push(`${at}: type 'scene3d' requires meshes (array)`);
			break;
		case "timeline":
			if (!Array.isArray(v.items)) errors.push(`${at}: type 'timeline' requires items (array)`);
			break;
		case "file-tree":
			if (!Array.isArray(v.items)) errors.push(`${at}: type 'file-tree' requires items (array)`);
			break;
		case "breadcrumb":
			if (!Array.isArray(v.items)) errors.push(`${at}: type 'breadcrumb' requires items (array)`);
			break;
		case "quiz":
			if (typeof v.question !== "string") errors.push(`${at}: type 'quiz' requires question (string)`);
			if (!Array.isArray(v.options)) errors.push(`${at}: type 'quiz' requires options (array)`);
			break;
		case "blocks":
			if (!Array.isArray(v.rows)) {
				errors.push(`${at}: type 'blocks' requires rows (array)`);
				break;
			}
			isNum("columns");
			v.rows.forEach((entry, i) => {
				const row = obj(entry);
				if (row === void 0) {
					errors.push(`${at}.rows[${i}] must be an object`);
					return;
				}
				if (!Array.isArray(row.cells)) {
					errors.push(`${at}.rows[${i}].cells must be an array`);
					return;
				}
				row.cells.forEach((cell, j) => {
					if (cell === null || typeof cell === "string") return;
					const holder = obj(cell);
					if (holder === void 0) {
						errors.push(`${at}.rows[${i}].cells[${j}] must be a string, null, or object`);
						return;
					}
					if (typeof holder.text !== "string") errors.push(`${at}.rows[${i}].cells[${j}].text must be a string`);
					if (holder.tone !== void 0 && !BLOCK_CELL_TONES.includes(holder.tone)) errors.push(`${at}.rows[${i}].cells[${j}].tone must be one of ${BLOCK_CELL_TONES.join(", ")}`);
					if (holder.color !== void 0 && color(holder.color) === void 0) errors.push(`${at}.rows[${i}].cells[${j}].color must be a literal colour or host token`);
				});
			});
			break;
		case "icon":
			if (typeof v.name !== "string") errors.push(`${at}: type 'icon' requires name (string)`);
			isNum("size");
			break;
		case "arrow": break;
		case "diagram":
			if (typeof v.kind !== "string") errors.push(`${at}: type 'diagram' requires kind (string)`);
			if (!Array.isArray(v.nodes)) errors.push(`${at}: type 'diagram' requires nodes (array)`);
			if (v.edges !== void 0 && !Array.isArray(v.edges)) errors.push(`${at}: type 'diagram' requires edges (array) when present`);
			break;
		case "echart":
			if (v.option === void 0 && v.data === void 0 && v.series === void 0 && (!Array.isArray(v.links) || v.links.length === 0)) errors.push(`${at}: type 'echart' requires option, data, series, or links`);
			isNum("height");
			break;
		default: if (!Object.hasOwn(COMPONENT_SCHEMAS, type)) errors.push(`${at}: unknown type '${type}' (custom renderer?)`);
	}
	const definition = COMPONENT_SCHEMAS[type];
	if (definition !== void 0) validateRegistryFields(v, at, definition, errors);
}
// src/shared/fence-repair.ts
/**
* Tier-1 repair — SAFE AT ANY TIME (streaming included): heals the most
* common model JSON typos that do NOT change the body's structure, and only
* when the whole body parses afterwards (so a still-growing streaming half
* can never be adopted):
*
* 1. Unescaped half-width `"` inside a string value — Chinese text quoted
*    with ASCII quotes (e.g. `对"别名路径"判定失败`), which makes JSON.parse
*    fail near that quote with "Expected ',' or ']'...".
* 2. Trailing commas before `}` / `]` or at end of input.
* 3. Valueless object keys immediately before a complete key-and-colon pair.
*
* A shared grammar-aware scan distinguishes object keys from values and
* checks the continuation after a potential string terminator. Ambiguous
* value quotes use bounded backtracking; trailing commas are dropped only
* outside strings.
*
* Returns `{ text, repairs }` on success, or null when nothing needed fixing
* or the body still does not parse (callers fall through to tier-2 / banner).
*/
function repairFenceJson(raw) {
	try {
		JSON.parse(raw);
		return null;
	} catch {}
	return scanFenceJson(raw, false);
}
/** A fixed search budget prevents quote ambiguity from becoming exponential. */
const MAX_QUOTE_ATTEMPTS = 32;
const MAX_QUOTE_LOOKAHEAD = 4096;
function isJsonSpace(ch) {
	return ch === " " || ch === "	" || ch === "\n" || ch === "\r";
}
/** Skip only complete, valueless object keys followed by a valued member. */
function skipValuelessKeys(raw, start, limit = raw.length) {
	let cursor = start;
	let repairs = 0;
	while (cursor < limit && raw[cursor] === "\"") {
		const keyStart = cursor++;
		while (cursor < limit && raw[cursor] !== "\"") if (raw[cursor] === "\\") cursor += 2;
		else cursor++;
		if (cursor >= limit) return null;
		cursor++;
		try {
			JSON.parse(raw.slice(keyStart, cursor));
		} catch {
			return null;
		}
		while (cursor < limit && isJsonSpace(raw[cursor])) cursor++;
		if (raw[cursor] === ":") return repairs > 0 ? {
			start: keyStart,
			repairs
		} : null;
		if (raw[cursor] !== ",") return null;
		repairs++;
		cursor++;
		while (cursor < limit && isJsonSpace(raw[cursor])) cursor++;
	}
	return null;
}
/**
* Quote closure is contextual: only keys may be followed by `:`, and a comma
* must introduce the next member of the enclosing object/array. Walk closing
* delimiters too, so a bracket in a quoted code example cannot end a value
* when prose immediately follows it inside the enclosing JSON structure.
* Lookahead has a fixed bound; inconclusive long continuations keep the
* terminator interpretation and leave the final JSON.parse as the arbiter.
*/
function quoteCanClose(raw, index, key, scopes, complete) {
	const limit = Math.min(raw.length, index + MAX_QUOTE_LOOKAHEAD);
	let cursor = index + 1;
	const skipSpace = () => {
		while (cursor < limit && isJsonSpace(raw[cursor])) cursor++;
	};
	skipSpace();
	if (cursor >= limit) return true;
	if (key) return raw[cursor] === ":";
	let scopeIndex = scopes.length - 1;
	if (raw[cursor] === ":") return false;
	while (raw[cursor] === "}" || raw[cursor] === "]") {
		const scope = scopes[scopeIndex];
		if (scope === void 0) return false;
		if (raw[cursor] === scope.closer) scopeIndex--;
		else if (!complete) return false;
		cursor++;
		skipSpace();
		if (cursor >= limit) return true;
		if (scopeIndex < 0) return complete;
	}
	if (raw[cursor] !== ",") return false;
	const scope = scopes[scopeIndex];
	if (scope === void 0) return false;
	cursor++;
	skipSpace();
	if (cursor >= limit) return true;
	if (raw[cursor] === scope.closer) return true;
	if (scope.closer === "]") return /["[{tfn\-0-9]/.test(raw[cursor]);
	if (raw[cursor] !== "\"") return false;
	const valueless = skipValuelessKeys(raw, cursor, limit);
	if (valueless !== null) cursor = valueless.start;
	cursor++;
	while (cursor < limit) {
		if (raw[cursor] === "\\") {
			cursor += 2;
			continue;
		}
		if (raw[cursor] === "\"") {
			cursor++;
			skipSpace();
			return cursor >= limit || raw[cursor] === ":";
		}
		if (raw[cursor].charCodeAt(0) < 32) return false;
		cursor++;
	}
	return true;
}
/** Both tiers share the same string-aware scan and quote decisions. */
function scanFenceCandidate(raw, complete, contentQuotes) {
	let out = "";
	const scopes = [];
	let inString = false;
	let key = false;
	let interiorQuote = false;
	let escaped = false;
	let repairs = 0;
	let rootEnd = 0;
	let rawRootEnd = 0;
	let invalidValue = false;
	const choices = [];
	const finishValue = () => {
		const scope = scopes[scopes.length - 1];
		if (scope !== void 0) scope.expecting = "comma";
	};
	for (let i = 0; i < raw.length; i++) {
		const ch = raw[i];
		if (escaped) {
			if (inString && ch === "\"") interiorQuote = true;
			out += ch;
			escaped = false;
			continue;
		}
		if (inString) {
			if (ch === "\\") {
				out += ch;
				escaped = true;
				continue;
			}
			if (ch !== "\"") {
				out += ch;
				continue;
			}
			let next = i + 1;
			while (next < raw.length && isJsonSpace(raw[next])) next++;
			const ordinaryEnd = !key && (!interiorQuote && ",}]:".includes(raw[next] ?? "\0") || scopes[scopes.length - 1]?.closer === "]" && raw[next] === ",");
			if (!contentQuotes.has(i) && (ordinaryEnd || quoteCanClose(raw, i, key, scopes, complete))) {
				inString = false;
				out += ch;
				const scope = scopes[scopes.length - 1];
				if (key) {
					if (scope !== void 0) scope.expecting = "colon";
				} else {
					finishValue();
					if (scope !== void 0 && interiorQuote) {
						if (choices.length === MAX_QUOTE_ATTEMPTS) choices.shift();
						choices.push(i);
					}
				}
			} else {
				out += "\\\"";
				interiorQuote = true;
				repairs++;
			}
			continue;
		}
		if (ch === "\"") {
			key = scopes[scopes.length - 1]?.expecting === "key";
			if (key) {
				const valueless = skipValuelessKeys(raw, i);
				if (valueless !== null) {
					repairs += valueless.repairs;
					i = valueless.start - 1;
					continue;
				}
			}
			interiorQuote = false;
			inString = true;
			out += ch;
			continue;
		}
		if (ch === "{" || ch === "[") {
			finishValue();
			scopes.push({
				closer: ch === "{" ? "}" : "]",
				expecting: ch === "{" ? "key" : "value"
			});
			out += ch;
			continue;
		}
		if (ch === "}" || ch === "]") {
			if (scopes[scopes.length - 1]?.closer === ch) {
				scopes.pop();
				out += ch;
				if (scopes.length === 0 && rootEnd === 0) {
					rootEnd = out.length;
					rawRootEnd = i + 1;
				}
			} else if (complete) repairs++;
			else out += ch;
			continue;
		}
		if (ch === ",") {
			let j = i + 1;
			while (j < raw.length && isJsonSpace(raw[j])) j++;
			if (j === raw.length || raw[j] === "}" || raw[j] === "]") {
				repairs++;
				continue;
			}
			const scope = scopes[scopes.length - 1];
			if (scope !== void 0) scope.expecting = scope.closer === "}" ? "key" : "value";
		} else if (ch === ":") {
			const scope = scopes[scopes.length - 1];
			if (scope !== void 0) scope.expecting = "value";
		} else if (!isJsonSpace(ch) && scopes[scopes.length - 1]?.expecting === "value") {
			let j = i + 1;
			while (j < raw.length && !isJsonSpace(raw[j]) && !"{}[],:\"".includes(raw[j])) j++;
			const token = raw.slice(i, j);
			if (!/^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)$/.test(token)) invalidValue = true;
			finishValue();
			out += token;
			i = j - 1;
			continue;
		}
		out += ch;
	}
	const unfinishedString = inString;
	if (complete) {
		if (inString) {
			out += "\"";
			repairs++;
		}
		while (scopes.length > 0) {
			out += scopes.pop().closer;
			repairs++;
		}
	}
	return {
		text: out,
		repairs,
		rootEnd,
		rawRootEnd,
		choices,
		unfinishedString,
		invalidValue
	};
}
/** Find an authoritative, already-valid object/array prefix without repair. */
function originalJsonPrefix(raw) {
	const scopes = [];
	let inString = false;
	let escaped = false;
	let started = false;
	for (let i = 0; i < raw.length; i++) {
		const ch = raw[i];
		if (escaped) {
			escaped = false;
			continue;
		}
		if (inString) {
			if (ch === "\\") escaped = true;
			else if (ch === "\"") inString = false;
			continue;
		}
		if (!started) {
			if (isJsonSpace(ch)) continue;
			if (ch !== "{" && ch !== "[") return null;
			started = true;
		}
		if (ch === "\"") {
			inString = true;
			continue;
		}
		if (ch === "{" || ch === "[") scopes.push(ch === "{" ? "}" : "]");
		else if (ch === "}" || ch === "]") {
			if (scopes.pop() !== ch) return null;
			if (scopes.length === 0) {
				const text = raw.slice(0, i + 1).trimEnd();
				try {
					JSON.parse(text);
					return text;
				} catch {
					return null;
				}
			}
		}
	}
	return null;
}
/**
* Prefer real terminators; if the resulting whole body fails, try interpreting
* a bounded number of ambiguous value quotes as content. Each attempt is an
* iterative scan, not a recursive parser; no engine-specific error offset is
* needed. Fixed attempts/lookahead give O(n) time and O(n) working storage.
*/
function scanFenceJson(raw, complete) {
	const original = originalJsonPrefix(raw);
	if (original !== null) return complete ? {
		text: original,
		repairs: 1
	} : null;
	const pending = [[]];
	let prefix = null;
	for (let attempt = 0; attempt < MAX_QUOTE_ATTEMPTS && pending.length > 0; attempt++) {
		const forced = pending.pop();
		const scanned = scanFenceCandidate(raw, complete, new Set(forced));
		if (scanned.repairs > 0 && !(forced.length > 0 && scanned.unfinishedString)) try {
			JSON.parse(scanned.text);
			return {
				text: scanned.text,
				repairs: scanned.repairs
			};
		} catch {}
		if (complete && scanned.rootEnd > 0 && (prefix === null || scanned.rawRootEnd > prefix.rawEnd)) {
			const text = scanned.text.slice(0, scanned.rootEnd).trimEnd();
			try {
				JSON.parse(text);
				prefix = {
					text,
					repairs: scanned.repairs + 1,
					rawEnd: scanned.rawRootEnd
				};
			} catch {}
		}
		if (scanned.invalidValue) continue;
		const last = forced[forced.length - 1] ?? -1;
		for (const quote of scanned.choices) if (quote > last) pending.push([...forced, quote]);
		if (pending.length > MAX_QUOTE_ATTEMPTS) pending.splice(0, pending.length - MAX_QUOTE_ATTEMPTS);
	}
	if (prefix !== null) return {
		text: prefix.text,
		repairs: prefix.repairs
	};
	return null;
}
/**
* Rewrite the "Tetris table" shape into legal JSON: the model closed the
* `columns` array after the header cells and then wrote the row matrix as a
* SIBLING array element —
*
*     "columns":["a","b"],["rows":[["1","2"],["3","4"]]]
*
* The element after `columns` is a `rows` field wearing the wrong hat, so
* restore the key (`"rows":[…]`) and drop the closer the mis-nesting left
* over (the final bracket-depth rescan removes every unmatched closer). Safe
* by construction: only applied to a body that does not parse, and the caller
* adopts the result only when the WHOLE body then parses.
*
* @param raw - the raw fence body.
* @returns the rewritten body plus the edit count, or null when the shape is
*   not present (or the columns array never closes).
*/
function rewriteTetrisTableColumns(raw) {
	if (!/"columns"\s*:\s*\[/.test(raw)) return null;
	let text = "";
	let rest = raw;
	let edits = 0;
	while (true) {
		const match = /"columns"\s*:\s*\[/.exec(rest);
		if (match === null) {
			text += rest;
			break;
		}
		const start = match.index + match[0].length;
		let depth = 1;
		let inString = false;
		let escaped = false;
		let end = -1;
		for (let i = start; i < rest.length; i++) {
			const ch = rest[i];
			if (escaped) {
				escaped = false;
				continue;
			}
			if (inString) {
				if (ch === "\\") escaped = true;
				else if (ch === "\"") inString = false;
				continue;
			}
			if (ch === "\"") {
				inString = true;
				continue;
			}
			if (ch === "[") depth++;
			else if (ch === "]") {
				depth--;
				if (depth === 0) {
					end = i;
					break;
				}
			}
		}
		if (end < 0) return null;
		const after = rest.slice(end + 1);
		const keyed = /^\s*,\s*\[\s*"rows"\s*:\s*\[/.exec(after);
		if (keyed !== null) {
			const through = end + 1 + keyed[0].length;
			text += `${rest.slice(0, end + 1)},"rows":[`;
			rest = rest.slice(through);
			edits += 1;
			continue;
		}
		const nextArray = /^\s*,\s*\[/.exec(after);
		if (nextArray === null) {
			text += rest.slice(0, end + 1);
			rest = after;
			continue;
		}
		const throughBracket = end + 1 + nextArray[0].length;
		text += rest.slice(0, throughBracket).replace(/,\s*\[$/, ", \"rows\": [");
		rest = rest.slice(throughBracket);
		edits += 1;
	}
	if (edits === 0) return null;
	const stack = [];
	let out = "";
	let inString = false;
	let escaped = false;
	for (const ch of text) {
		if (escaped) {
			out += ch;
			escaped = false;
			continue;
		}
		if (inString) {
			out += ch;
			if (ch === "\\") escaped = true;
			else if (ch === "\"") inString = false;
			continue;
		}
		if (ch === "\"") {
			inString = true;
			out += ch;
			continue;
		}
		if (ch === "{" || ch === "[") {
			stack.push(ch);
			out += ch;
			continue;
		}
		if (ch === "}" || ch === "]") {
			const open = stack[stack.length - 1];
			if (ch === "}" && open === "{" || ch === "]" && open === "[") {
				stack.pop();
				out += ch;
			} else edits += 1;
			continue;
		}
		out += ch;
	}
	return {
		text: out,
		repairs: edits
	};
}
/**
* Tier-2 repair — SETTLED MESSAGES ONLY (never while streaming): heals
* structural incompleteness — missing closing quotes/brackets — by appending
* the missing terminators, and heals stray closers — a `]` mistyped as `}` or
* a duplicated terminator — by skipping closers that do not match the open
* stack (they cannot be legal JSON). Callers gate it on settled messages (the
* client uses the host-provided fence source; the validate tool is by
* definition pre-emission), so a streaming half can never flash premature UI.
*
* One shared scan implementation folds the tier-1 fixes (quote escaping +
* trailing-comma drops) into structural completion, so bodies with BOTH defects
* (a trailing comma AND a missing closer) heal in one shot — the old
* two-phase chain lost tier-1's partial work when its whole-body parse
* failed, and re-scanning the raw text could not compose the repairs.
* Adopted only when the completed body parses as whole JSON.
*/
function completeFenceJson(raw) {
	try {
		JSON.parse(raw);
		return null;
	} catch {}
	const tetris = rewriteTetrisTableColumns(raw);
	if (tetris !== null) {
		try {
			JSON.parse(tetris.text);
			return tetris;
		} catch {}
		const scanned = completeFenceJson(tetris.text);
		if (scanned === null) return null;
		return {
			text: scanned.text,
			repairs: scanned.repairs + tetris.repairs
		};
	}
	return scanFenceJson(raw, true);
}
// src/plugin/genui-diagnostic.ts
/** 获取指定组件类型已知字段，保持提示顺序稳定。 */
function knownFieldsOf(type) {
	const schema = COMPONENT_SCHEMAS[type];
	if (schema === void 0) return [];
	return [...schema.required, ...Object.keys(schema.optional)];
}
/** 获取校验错误对应的节点路径。 */
function nodePathOf(error) {
	const match = /^(items\[\d+\](?:\.items\[\d+\])*)(?=:|\.items\[|$)/.exec(error);
	return match === null ? null : match[1];
}
/** 根据节点路径读取模型声明的节点对象。 */
function declaredNodeAt(value, path) {
	if (typeof value !== "object" || value === null) return void 0;
	const root = value;
	const normalized = path.replace(/^items/, "");
	let current = normalized === "" ? root : root.items;
	for (const step of normalized.replace(/^\./, "").split(".").filter((part) => part !== "")) {
		const matched = /(?:items)?\[(\d+)\]/.exec(step);
		const index = matched === null ? NaN : Number(matched[1]);
		if (!Number.isInteger(index) || !Array.isArray(current)) return void 0;
		current = current[index];
	}
	return typeof current === "object" && current !== null && !Array.isArray(current) ? current : void 0;
}
/** 将校验错误转换为固定协议字段。 */
function fieldSymptom(error, path, type) {
	const rest = error.slice(path.length);
	const unknown = /^\.([A-Za-z0-9_-]+): unknown field\b/.exec(rest);
	if (unknown !== null) {
		const known = knownFieldsOf(type);
		return [
			`error=unknown_field`,
			`field=${unknown[1]}`,
			...known.length === 0 ? [] : [`allowed=${known.join(",")}`]
		].join("\n");
	}
	const missing = /requires ([A-Za-z0-9_-]+)/.exec(rest);
	if (missing !== null) return `error=missing_required_field\nfield=${missing[1]}`;
	return `error=validation_error\ndetail=${JSON.stringify(rest.replace(/^:\s*/, "").slice(0, 120))}`;
}
/** 获取校验错误中声明的组件类型。 */
function errorTypeOf(error) {
	return /type '([^']+)'/.exec(error)?.[1];
}
/** 生成被丢弃节点的路径、类型和字段诊断。 */
function droppedNodeDiagnosis(processed, raw) {
	const byPath = /* @__PURE__ */ new Map();
	for (const error of processed.errors) {
		const path = nodePathOf(error);
		if (path === null) continue;
		const bucket = byPath.get(path);
		if (bucket === void 0) byPath.set(path, [error]);
		else bucket.push(error);
	}
	const lines = [];
	for (const [path, errors] of byPath) {
		const node = declaredNodeAt(raw, path);
		const type = (typeof node?.type === "string" ? node.type : void 0) ?? errors.map(errorTypeOf).find((candidate) => candidate !== void 0);
		if (type !== void 0 && repairedContainsType(processed.repaired, type)) continue;
		const emitted = node === void 0 ? [] : Object.keys(node).filter((key) => key !== "type");
		const symptoms = [...new Set(errors.map((error) => fieldSymptom(error, path, type ?? "unknown")))];
		lines.push([
			`node=${path}`,
			`type=${type ?? "unknown"}`,
			...symptoms,
			...emitted.length === 0 ? [] : [`written=${emitted.join(",")}`]
		].join("\n"));
	}
	return lines;
}
/** 检查修复后的组件树中是否仍然存在指定类型的原生节点。 */
function repairedContainsType(node, type) {
	if (Array.isArray(node)) return node.some((child) => repairedContainsType(child, type));
	if (typeof node !== "object" || node === null) return false;
	const record = node;
	if (record.type === type) return true;
	return Object.values(record).some((child) => repairedContainsType(child, type));
}
/**
* 报告被丢弃的组件，并保留模型可以直接修正的字段信息。
*
* @param processed - 节点处理结果。
* @param raw - 节点处理使用的原始值。
* @returns 可嵌入调用方协议的诊断字段；没有节点被丢弃时返回 undefined。
*/
function droppedNodeFailure(processed, raw) {
	if (!processed.errors.some((error) => error.startsWith("repair dropped "))) return void 0;
	const dropped = processed.declaredNativeCount - processed.renderedNativeCount;
	const diagnosis = droppedNodeDiagnosis(processed, raw);
	return [
		`declared=${processed.declaredNativeCount}`,
		`rendered=${processed.renderedNativeCount}`,
		`dropped=${dropped}`,
		...diagnosis.flatMap((line) => [line, ""]),
		...processed.errors.map((error) => `diagnostic=${JSON.stringify(error)}`)
	];
}
// src/plugin/inline-content-diagnostic.ts
/** 识别文字字段中的连续代码围栏标记。 */
function hasFencedCode(value) {
	return /`{3,}|~{3,}/.test(value);
}
/** 判断相邻表头下方的 Markdown 表格分隔行。 */
function isMarkdownTableSeparator(line) {
	let value = line.trim();
	if (value.startsWith("|")) value = value.slice(1);
	if (value.endsWith("|")) value = value.slice(0, -1);
	const cells = value.split("|").map((cell) => cell.trim());
	return cells.length >= 2 && cells.every((cell) => /^:?-{2,}:?$/.test(cell));
}
/** 仅在相邻表头和分隔行构成表格时报告。 */
function hasMarkdownTable(value) {
	const lines = value.split(/\r?\n/);
	for (let i = 0; i + 1 < lines.length; i++) if (lines[i].includes("|") && isMarkdownTableSeparator(lines[i + 1])) return true;
	return false;
}
/** 按组件结构检查需要块级内容诊断的 canonical 显示字段。 */
function collectInlineContentWarnings(spec) {
	const warnings = [];
	/** 将一个可见文字字段中的块级 Markdown 记录为稳定诊断。 */
	function check(value, path) {
		if (value === void 0) return;
		if (hasFencedCode(value)) warnings.push({
			path,
			kind: "fenced_code",
			replacement: "code"
		});
		if (hasMarkdownTable(value)) warnings.push({
			path,
			kind: "markdown_table",
			replacement: "table"
		});
	}
	/** 只沿 GenUI 组件的子节点字段访问下一层。 */
	function visit(node, path) {
		switch (node.type) {
			case "text":
				check(node.content, `${path}.content`);
				break;
			case "card":
				check(node.title, `${path}.title`);
				node.items.forEach((child, i) => visit(child, `${path}.items[${i}]`));
				break;
			case "row":
			case "col":
			case "grid":
				node.items.forEach((child, i) => visit(child, `${path}.items[${i}]`));
				break;
			case "button":
			case "checkbox":
			case "link":
			case "badge":
			case "switch":
			case "submit":
				check(node.label, `${path}.label`);
				break;
			case "input":
			case "select":
			case "slider":
			case "textarea":
				check(node.label, `${path}.label`);
				break;
			case "radio":
				check(node.label, `${path}.label`);
				node.options.forEach((option, i) => check(option, `${path}.options[${i}]`));
				if (typeof node.answer === "string") check(node.answer, `${path}.answer`);
				check(node.explanation, `${path}.explanation`);
				break;
			case "image":
			case "audio":
			case "video":
				check(node.alt, `${path}.alt`);
				break;
			case "hero":
				for (const field of [
					"label",
					"value",
					"delta",
					"title",
					"subtitle"
				]) check(node[field], `${path}.${field}`);
				break;
			case "stat":
				for (const field of [
					"label",
					"value",
					"delta"
				]) check(node[field], `${path}.${field}`);
				break;
			case "progress":
				check(node.label, `${path}.label`);
				check(node.valueLabel, `${path}.valueLabel`);
				break;
			case "list":
				node.items.forEach((item, i) => {
					const itemPath = `${path}.items[${i}]`;
					if (typeof item === "string") check(item, itemPath);
					else if ("type" in item && typeof item.type === "string") visit(item, itemPath);
					else {
						check(item.title, `${itemPath}.title`);
						check(item.desc, `${itemPath}.desc`);
					}
				});
				break;
			case "table":
				node.columns.forEach((column, i) => check(column, `${path}.columns[${i}]`));
				node.rows.forEach((row, i) => {
					const detail = node.details?.[i] ?? null;
					row.forEach((cell, j) => {
						if (node.types?.[j] === "index" && (j !== 0 || detail === null)) return;
						if (typeof cell === "string") check(cell, `${path}.rows[${i}][${j}]`);
					});
				});
				node.details?.forEach((detail, i) => detail?.forEach((child, j) => visit(child, `${path}.details[${i}][${j}]`)));
				break;
			case "chart":
				node.series?.forEach((series, i) => check(series.label, `${path}.series[${i}].label`));
				break;
			case "tabs":
				node.tabs.forEach((tab, i) => {
					check(tab.label, `${path}.tabs[${i}].label`);
					tab.items.forEach((child, j) => visit(child, `${path}.tabs[${i}].items[${j}]`));
				});
				break;
			case "accordion":
				node.items.forEach((item, i) => {
					check(item.title, `${path}.items[${i}].title`);
					item.items.forEach((child, j) => visit(child, `${path}.items[${i}].items[${j}]`));
				});
				break;
			case "callout":
				check(node.title, `${path}.title`);
				check(node.content, `${path}.content`);
				break;
			case "steps":
				node.steps.forEach((step, i) => {
					check(step.title, `${path}.steps[${i}].title`);
					check(step.desc, `${path}.steps[${i}].desc`);
				});
				break;
			case "keyvalue":
				node.pairs.forEach((pair, i) => {
					check(pair.key, `${path}.pairs[${i}].key`);
					check(pair.value, `${path}.pairs[${i}].value`);
				});
				break;
			case "timeline":
				node.items.forEach((item, i) => {
					check(item.title, `${path}.items[${i}].title`);
					check(item.time, `${path}.items[${i}].time`);
					check(item.desc, `${path}.items[${i}].desc`);
				});
				break;
			case "breadcrumb":
				node.items.forEach((item, i) => check(item, `${path}.items[${i}]`));
				break;
			case "quiz":
				check(node.question, `${path}.question`);
				node.options.forEach((option, i) => {
					check(option.label, `${path}.options[${i}].label`);
					check(option.feedback, `${path}.options[${i}].feedback`);
				});
				check(node.explanation, `${path}.explanation`);
				break;
			case "plot":
			case "echart":
			case "diagram":
			case "scene3d":
			case "svg":
				check(node.title, `${path}.title`);
				break;
			case "copy": check(node.label, `${path}.label`);
		}
	}
	check(spec.title, "title");
	spec.items.forEach((node, i) => visit(node, `items[${i}]`));
	return warnings;
}
// src/plugin/tool.ts
/**
* Arguments schema: an open `spec` slot. The schema must NOT reject anything
* the guard could repair — the model's component trees are imperfect by
* nature, and the guard heals them; argument validation would only strand
* them. `additionalProperties: false` keeps the call shape honest.
*
* `spec` IS typed `object` on purpose: the guard can only repair plain
* records (a serialized JSON string, array, or scalar root is unusable), so
* argument validation rejecting non-objects loses nothing repairable — and
* it stops the model from double-encoding the tree as a string (observed
* twice in the wild), failing fast with a clear schema error instead.
*/
const RENDER_UI_PARAMETERS = {
	type: "object",
	properties: { spec: {
		type: "object",
		description: [
			"Render structured UI for the user (tool-row card). USE THIS whenever the answer contains ≥3 parallel points, a comparison, numbers/metrics, a step sequence, a flow, or a status/report — do NOT write those as markdown bullets or a markdown table.",
			"Same white-listed vocabulary as the ```dsh-ui fence (see the GenUI system-prompt section). Pick the fence when the UI belongs in the message body; pick this tool when the deliverable is a self-contained card.",
			"Deep-validated and repaired by the renderer. Pass the spec as a JSON OBJECT — never as a serialized JSON string (a string fails argument validation)."
		].join(" "),
		properties: {
			title: {
				type: "string",
				description: "Short title shown as the card banner."
			},
			gap: {
				type: "number",
				description: "Vertical gap between root items in px."
			},
			panel: {
				type: "boolean",
				description: "Panel-only: renders into the session panel dock instead of the message flow."
			},
			items: {
				type: "array",
				description: "Root component list (white-listed vocabulary).",
				items: { type: "object" }
			}
		}
	} },
	required: ["spec"],
	additionalProperties: false
};
/** The tool's canonical value is a short model-facing summary string. */
const RENDER_UI_OUTPUT_SCHEMA = {
	type: "string",
	description: "One-line human-readable render summary for the model."
};
/**
* Read the `spec` argument defensively (presenters run on replayed args).
*
* The harness tool-call bridge has been observed to deliver arguments in
* shapes other than the authored `{ spec: <object> }`:
* - `{ spec: "<JSON string>" }` — spec serialized to text;
* - `{ arguments: "<JSON string>" }` / `{ arguments: <object> }` — a
*   double-encoded wrapper from the SDK tool-call bridge (seen live in the
*   web GUI: small specs arrived wrapped this way, large specs arrived with
*   their JSON corrupted mid-stream);
* - a bare JSON string (double-encoded root).
* Each shape is unwrapped here so the guard can repair the actual tree.
* Corrupted JSON cannot be recovered (bytes were lost in transit): it yields
* `undefined` plus a diagnostic log line for the transport-layer bug.
*/
function specOf(args) {
	if (typeof args === "string") return parseSpecJson(args, "bare-string");
	if (typeof args !== "object" || args === null) return void 0;
	const record = args;
	if ("spec" in record) {
		const s = record.spec;
		if (typeof s === "string") return parseSpecJson(s, "spec-string");
		return unwrapSpec(s, "spec");
	}
	if ("arguments" in record) {
		const a = record.arguments;
		if (typeof a === "string") return parseSpecJson(a, "arguments-string");
		if (typeof a === "object" && a !== null) return unwrapSpec(a, "arguments");
	}
}
/**
* Peel nested `{ spec: ... }` wrapper layers. Observed bridge shapes nest the
* authored `spec` object one or more levels deep (e.g. the serialized text
* inside `{ arguments: "..." }` is itself `{ spec: { title, gap, items } }`),
* so unwrapping stops only at a value that carries no `spec` key.
*/
function unwrapSpec(value, shape) {
	if (typeof value === "object" && value !== null) {
		const record = value;
		if ("spec" in record) {
			const s = record.spec;
			if (typeof s === "string") return parseSpecJson(s, `${shape}/spec-string`);
			return unwrapSpec(s, `${shape}/spec`);
		}
	}
	return value;
}
/** Try to decode a serialized spec; log a diagnostic when it is broken. */
function parseSpecJson(raw, shape) {
	try {
		return unwrapSpec(JSON.parse(raw), shape);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		const pos = /position (\d+)/.exec(detail)?.[1] ?? "?";
		console.error(`[genui-tool] spec wrapped as ${shape} but its JSON is broken (${raw.length} bytes, error at ${pos}); cannot recover — bytes lost in transit`);
		return;
	}
}
/** Process a raw tool value once for all render-time decisions. */
function processRenderableValue(value) {
	return processGenuiSpec(value);
}
/** Wrap model-facing validation fields in the stable GenUI protocol envelope. */
function validationProtocol(lines) {
	return [
		"[genui-validation]",
		...lines,
		"reply_language=conversation"
	].join("\n");
}
/** Render process diagnostics as stable model-facing warning fields. */
function formatProcessWarnings(processed) {
	return processed.warnings.map((warning) => {
		if (warning.kind === "alias" && warning.canonical !== void 0) {
			const separator = warning.path.lastIndexOf(".");
			const canonicalPath = `${separator < 0 ? "" : warning.path.slice(0, separator + 1)}${warning.canonical}`;
			return warning.message.includes("ignored") ? `warning=alias_ignored path=${warning.path} canonical=${canonicalPath}` : `warning=alias_normalized path=${warning.path} canonical=${canonicalPath}`;
		}
		if (warning.kind === "unknown-field") return `warning=unknown_field path=${JSON.stringify(warning.path)} detail=${JSON.stringify(warning.message)}`;
		if (warning.kind === "truncated") return `warning=policy_truncated path=${JSON.stringify(warning.path)} detail=${JSON.stringify(warning.message)}`;
		return `warning=process detail=${JSON.stringify(warning.message)}`;
	});
}
/** 将行内字段的块级 Markdown 诊断写入稳定的验证协议。 */
function formatInlineContentWarnings(spec) {
	return collectInlineContentWarnings(spec).map((warning) => `warning=block_markdown path=${warning.path} kind=${warning.kind} replacement=${warning.replacement}`);
}
/** Format chart-specific process errors while keeping other schema errors generic. */
function formatProcessFailure(processed) {
	const chartErrors = processed.errors.filter((error) => /(?:variant is unsupported|kind must be bars, line, or donut|requires data or series|(?:data|series) is required for|(?:\.data|\.series)(?:\[\d+\])?(?:\.(?:data|label|value|color))? must|series is only supported for bars)/.test(error));
	return chartErrors.length === 0 ? void 0 : validationProtocol([
		"status=invalid",
		"error=invalid_chart_fields",
		...chartErrors.map((error) => `diagnostic=${JSON.stringify(error)}`),
		"next=fix_and_revalidate"
	]);
}
/** Tool-call title shared by the pending and completed presentations. */
function cardTitle(args) {
	const processed = processRenderableValue(specOf(args));
	if (!isRenderableProcess(processed) || processed.spec === null) return void 0;
	return `渲染 UI：${processed.spec.title ?? "未命名"}`;
}
/**
* Build the render_ui tool definition. Registered by the plugin node half;
* `ctx.tools.register` consumes it exactly like a `defineTool` result.
*/
function createRenderUiTool() {
	return {
		name: "render_ui",
		description: "Render an interactive UI card in the conversation tool row by passing a GenUI spec (a white-listed component tree; the same vocabulary as the ```dsh-ui fence, see the system prompt). Use it when the user asks for a structured panel, dashboard, or form that belongs in the tool row rather than inline in the reply. The card is interactive client-side (tabs, buttons, inputs, switches); components carrying an \"action\" field send [genui-action] back to you when the user interacts, and you should re-render the updated UI.",
		parameters: RENDER_UI_PARAMETERS,
		output: {
			schema: RENDER_UI_OUTPUT_SCHEMA,
			render(_args, value) {
				return [{
					type: "text",
					text: String(value)
				}];
			},
			presentationMeta(args) {
				const processed = processRenderableValue(specOf(args));
				return isRenderableProcess(processed) ? processed.spec : null;
			}
		},
		async execute(args) {
			const processed = processRenderableValue(specOf(args));
			if (processed.spec === null) return [
				"[genui-render]",
				"status=invalid",
				"error=invalid_spec",
				"required=items",
				"next=fix_and_retry",
				"reply_language=conversation"
			].join("\n");
			if (!isRenderableProcess(processed)) throw new Error("render_ui spec invalid: " + processed.errors.join("; "));
			const spec = processed.spec;
			const warnings = formatProcessWarnings(processed);
			return [
				"[genui-render]",
				"status=rendered",
				...spec.title === void 0 ? [] : [`title=${JSON.stringify(spec.title)}`],
				`rendered=${processed.renderedCount}`,
				"action_feedback=[genui-action]",
				...warnings,
				"reply_language=conversation"
			].join("\n");
		},
		presentCall(args) {
			const title = cardTitle(args);
			return title === void 0 ? void 0 : {
				card: "generic",
				title,
				kind: "other"
			};
		},
		presentResult(args) {
			const title = cardTitle(args);
			return title === void 0 ? void 0 : {
				card: "generic",
				title
			};
		}
	};
}
/**
* The `validate_dsh_ui` tool: a model-facing pre-flight check for the
* ```dsh-ui fence channel. The model calls it with the JSON text it is about
* to put inside a fence; it reports whether the body parses as a valid GenUI
* spec, and when it does not, WHERE it breaks and WHAT is likely wrong
* (bracket counts, common typo classes) so the model can fix and re-validate
* before emitting — turning "render a red banner after the fact" into
* "verify before you send". Purely local: no LLM, no network, no DOM.
*/
const VALIDATE_DESCRIPTION = "Validate the JSON body of a ```dsh-ui fence BEFORE emitting it — use for non-trivial specs (≥3 nodes or containing a table); skip for trivial ones (≤2 nodes). Pass the exact JSON text you are about to put inside the fence as the \"spec\" argument (a string). Returns a [genui-validation] protocol block with status, diagnostics, next action, and reply_language=conversation. When invalid JSON is repairable, repaired_json contains the fixed body; emit it only with next=emit_repaired_fence. A warning=unknown_field requires fixing the indicated path and another validation call. A warning=block_markdown requires the indicated replacement node and another validation call.";
const VALIDATE_PARAMETERS = {
	type: "object",
	properties: { spec: {
		oneOf: [{
			type: "string",
			description: "The exact JSON text of the fence body."
		}, {
			type: "object",
			description: "The spec object (serialized before validation)."
		}],
		description: "The dsh-ui fence body to validate: pass the JSON as a string for an exact check, or as the spec object."
	} },
	required: ["spec"],
	additionalProperties: false
};
/** Read the fence-body text from the call args (string preferred, object serialized). */
function fenceTextOf(args) {
	if (typeof args === "string") return args;
	if (typeof args !== "object" || args === null) return null;
	const record = args;
	const s = "spec" in record ? record.spec : "arguments" in record ? record.arguments : void 0;
	if (typeof s === "string") return s;
	if (typeof s === "object" && s !== null) return JSON.stringify(s);
	return null;
}
/** Count structural brackets outside string literals. */
function bracketCounts(raw) {
	const counts = {
		"{": 0,
		"}": 0,
		"[": 0,
		"]": 0
	};
	let inString = false;
	let escaped = false;
	for (let i = 0; i < raw.length; i++) {
		const ch = raw[i];
		if (escaped) {
			escaped = false;
			continue;
		}
		if (inString) {
			if (ch === "\\") escaped = true;
			else if (ch === "\"") inString = false;
			continue;
		}
		if (ch === "\"") {
			inString = true;
			continue;
		}
		if (ch === "{") counts["{"] += 1;
		else if (ch === "}") counts["}"] += 1;
		else if (ch === "[") counts["["] += 1;
		else if (ch === "]") counts["]"] += 1;
	}
	return counts;
}
/** Return stable structural count fields for an invalid JSON body. */
function bracketDiagnostic(raw) {
	const c = bracketCounts(raw);
	const fields = [
		`braces_open=${c["{"]}`,
		`braces_close=${c["}"]}`,
		`brackets_open=${c["["]}`,
		`brackets_close=${c["]"]}`
	];
	if (c["{"] !== c["}"]) {
		const d = c["{"] - c["}"];
		fields.push(`brace_delta=${d}`, `brace_action=${d > 0 ? `add:${d}` : `remove:${-d}`}`);
	}
	if (c["["] !== c["]"]) {
		const d = c["["] - c["]"];
		fields.push(`bracket_delta=${d}`, `bracket_action=${d > 0 ? `add:${d}` : `remove:${-d}`}`);
	}
	return fields;
}
const COMMON_CAUSES = "likely_causes=unbalanced_delimiters,unescaped_quote,trailing_comma,unterminated_string";
/** Build the validate_dsh_ui tool definition (registered alongside render_ui). */
function createValidateDshUiTool() {
	return {
		name: "validate_dsh_ui",
		description: VALIDATE_DESCRIPTION,
		parameters: VALIDATE_PARAMETERS,
		output: {
			schema: {
				type: "string",
				description: "Validation verdict for the model."
			},
			render(_args, value) {
				return [{
					type: "text",
					text: String(value)
				}];
			}
		},
		async execute(args) {
			const raw = fenceTextOf(args);
			if (raw === null || raw.trim() === "") return validationProtocol([
				"status=invalid",
				"error=missing_spec",
				"next=provide_spec"
			]);
			let parsed;
			try {
				parsed = JSON.parse(raw);
			} catch (error) {
				const detail = error instanceof Error ? error.message : String(error);
				const repaired = completeFenceJson(raw);
				if (repaired !== null) {
					const processed = processRenderableValue(JSON.parse(repaired.text));
					const chartFailure = formatProcessFailure(processed);
					if (chartFailure !== void 0) return chartFailure;
					if (processed.spec !== null && processed.errors.length === 0) {
						const warnings = formatProcessWarnings(processed);
						const inlineWarnings = formatInlineContentWarnings(processed.spec);
						const requiresCorrection = inlineWarnings.length > 0 || processed.warnings.some((warning) => warning.kind === "unknown-field");
						return `${validationProtocol([
							"status=invalid",
							"error=invalid_json",
							`detail=${JSON.stringify(detail)}`,
							...bracketDiagnostic(raw),
							...warnings,
							...inlineWarnings,
							"repair=applied",
							`repair_count=${repaired.repairs}`,
							requiresCorrection ? "next=fix_and_revalidate" : "next=emit_repaired_fence"
						])}\nrepaired_json:\n\`\`\`\n${repaired.text}\n\`\`\``;
					}
				}
				return validationProtocol([
					"status=invalid",
					"error=invalid_json",
					`detail=${JSON.stringify(detail)}`,
					...bracketDiagnostic(raw),
					"repair=failed",
					COMMON_CAUSES,
					"next=fix_and_revalidate"
				]);
			}
			const processed = processRenderableValue(parsed);
			const chartFailure = formatProcessFailure(processed);
			if (chartFailure !== void 0) return chartFailure;
			if (processed.spec === null || processed.errors.length > 0) {
				const dropped = droppedNodeFailure(processed, parsed);
				return dropped === void 0 ? validationProtocol([
					"status=invalid",
					"error=invalid_spec",
					...processed.errors.length === 0 ? ["required=items", "node_types=whitelist"] : processed.errors.map((error) => `diagnostic=${JSON.stringify(error)}`),
					"next=fix_and_revalidate"
				]) : validationProtocol([
					"status=invalid",
					...dropped,
					"next=fix_and_revalidate"
				]);
			}
			const warnings = formatProcessWarnings(processed);
			const inlineWarnings = formatInlineContentWarnings(processed.spec);
			const requiresCorrection = inlineWarnings.length > 0 || processed.warnings.some((warning) => warning.kind === "unknown-field");
			return validationProtocol([
				"status=valid",
				`rendered=${processed.renderedCount}`,
				...warnings,
				...inlineWarnings,
				requiresCorrection ? "next=fix_and_revalidate" : "next=emit_fence"
			]);
		},
		presentCall() {
			return {
				card: "generic",
				title: "验证 dsh-ui 围栏",
				kind: "other"
			};
		},
		presentResult() {
			return {
				card: "generic",
				title: "验证 dsh-ui 围栏"
			};
		}
	};
}
let repairAttemptsLimit = 32;
/** Single left-to-right pass over the raw body. Tracks the bracket stack
*  (skipping strings/escapes correctly) and records:
*  - every position where the prefix is fully balanced (trailing comma or
*    fence tail) — candidate with an empty closing suffix;
*  - every top-level `items[]` component close — candidate with the root
*    array/object closed (an unfinished trailing component is dropped). Nested
*    object closes are not candidates because their component is still partial.
*  Candidates are ring-buffered to the attempts budget (the LAST pushes are
*  the longest), then returned longest-first, deduplicated by end. The scan
*  stops at the first unbalanced close — earlier balanced prefixes remain
*  valid candidates.
*
* Exposed for tests (the `scannedChars` diagnostic); not exported from the
* package entry. The parser calls this exactly once per parse.
*/
function collectPartialCandidates(raw) {
	const stack = [];
	const candidates = [];
	const push = (c) => {
		if (candidates.length >= repairAttemptsLimit) candidates.shift();
		candidates.push(c);
	};
	let inString = false;
	let escaped = false;
	let scanned = 0;
	for (; scanned < raw.length; scanned++) {
		const ch = raw[scanned];
		if (inString) {
			if (escaped) escaped = false;
			else if (ch === "\\") escaped = true;
			else if (ch === "\"") inString = false;
			continue;
		}
		if (ch === "\"") {
			inString = true;
			continue;
		}
		if (ch === "{" || ch === "[") {
			stack.push(ch);
			continue;
		}
		if (ch === "}" || ch === "]") {
			if (stack.pop() !== (ch === "}" ? "{" : "[")) break;
			if (ch === "}" && stack.length === 2 && stack[0] === "{" && stack[1] === "[") push({
				end: scanned + 1,
				closingSuffix: "]}"
			});
			if (stack.length === 0) push({
				end: scanned + 1,
				closingSuffix: ""
			});
			continue;
		}
	}
	candidates.sort((a, b) => b.end - a.end);
	const deduped = [];
	for (const c of candidates) if (deduped.length === 0 || deduped[deduped.length - 1].end !== c.end) deduped.push(c);
	return {
		candidates: deduped.slice(0, repairAttemptsLimit),
		scannedChars: scanned
	};
}
/** Try to parse a candidate as a GenuiSpec. */
function trySpec(candidate, allowSingleComponentRoot) {
	try {
		let value = JSON.parse(candidate);
		if (typeof value === "string") try {
			value = JSON.parse(value);
		} catch {
			return null;
		}
		if (isGenuiSpec(value)) return value;
		if (Array.isArray(value) && value.length > 0) return { items: value };
		return allowSingleComponentRoot ? wrapSingleComponentRoot(value) : null;
	} catch {
		return null;
	}
}
/**
* Parse a possibly incomplete genui spec body.
* @param raw - the fence body as accumulated so far.
* @returns a spec containing only finished components, or null when nothing
*   usable has been written yet.
*/
function parsePartialGenuiSpec(raw) {
	const text = raw.trim();
	if (text === "") return null;
	const full = trySpec(text, true);
	if (full !== null) return full;
	const { candidates } = collectPartialCandidates(text);
	for (const candidate of candidates) {
		const spec = trySpec(text.slice(0, candidate.end) + candidate.closingSuffix, false);
		if (spec !== null) return spec;
	}
	return null;
}
// src/shared/fence-resolve.ts
/**
* 使用浏览器 renderer 与 Node 侧最终回复反馈守卫共用的流程解析 dsh-ui 围栏正文。
* @module dsh-vt-gen-ui/shared/fence-resolve
*/
/**
* 对已经解析的值执行规格守卫和坏节点清理。
*
* @param value - 已解析或部分解析的围栏值。
* @returns 当前候选正文的规格处理结果。
*/
function resolveParsedFence(value) {
	const processed = processGenuiSpec(value);
	return {
		value,
		processed,
		spec: partialRepairGenuiSpec(processed)
	};
}
/** 返回没有可解析正文的围栏处理结果。 */
function unresolvedFence() {
	return {
		value: null,
		processed: null,
		spec: null
	};
}
/**
* 使用 renderer 的统一流程解析原始 dsh-ui 正文。
*
* 流式生成期间可以使用 tier-1 修复。tier-2 补全修复只允许用于回合结束后的回复，
* 防止未完成的正文提前渲染。
*
* @param raw - dsh-ui 围栏标记之间的原始正文。
* @param options - 流式或回合结束后的解析策略。
* @returns 通过规格守卫的渲染 spec；正文无法渲染时返回 null。
*/
function resolveFence(raw, options) {
	const parsed = parsePartialGenuiSpec(raw);
	let resolution = parsed === null ? unresolvedFence() : resolveParsedFence(parsed);
	if (resolution.spec !== null) return resolution;
	const repaired = repairFenceJson(raw);
	if (repaired !== null) {
		const reparsed = parsePartialGenuiSpec(repaired.text);
		resolution = reparsed === null ? unresolvedFence() : resolveParsedFence(reparsed);
	}
	if (resolution.spec !== null || !options.settled) return resolution;
	const completed = completeFenceJson(raw);
	if (completed === null) return resolution;
	const reparsed = parsePartialGenuiSpec(completed.text);
	return reparsed === null ? unresolvedFence() : resolveParsedFence(reparsed);
}
// src/shared/fence-language.ts
/** 围栏开头的 `dsh-ui` 标签在书写时可能被带上标点（```dsh-ui> / ```dsh-ui` …）。
* 这类标记在 mdast 里原样留在 `lang` 上，严格相等判断会让整条围栏静默退化成
* 普通代码块——真实会话里同一个模型可以在一条消息里写出 182 个这样的围栏。
* 这里只吸收**标签之后**的标点，`dsh-ui-something` 这样的真实语言名不受影响。 */
const GENUI_LABEL_PATTERN = /^dsh-ui$/;
const GENUI_TRAILING_PUNCTUATION = /[>`"'.,;:)\]】」』]+$/;
/**
* 把宿主的围栏语言标记规范化成 GenUI 能识别的写法。
*
* @param lang - 宿主 markdown 里的原始 language（可能含尾部标点或大小写差异）
* @returns 规范化后的语言名；无法规范化时返回输入本身
*/
function normalizeFenceLanguage(lang) {
	const trimmed = lang.trim();
	if (GENUI_LABEL_PATTERN.test(trimmed.toLowerCase())) return "dsh-ui";
	const stripped = trimmed.replace(GENUI_TRAILING_PUNCTUATION, "").trim().toLowerCase();
	if (GENUI_LABEL_PATTERN.test(stripped)) return "dsh-ui";
	return lang;
}
/**
* 判断语言标记是否指向 GenUI 围栏。
*
* @param lang - 宿主暴露的围栏语言（`null` = 围栏没有语言）
* @returns 规范化为 `dsh-ui` 时返回 true
*/
function isGenuiFenceLanguage(lang) {
	return typeof lang === "string" && normalizeFenceLanguage(lang) === "dsh-ui";
}
// src/plugin/fence-feedback.ts
/** Plugin name recorded on every message this loop steers. */
const FEEDBACK_PLUGIN_NAME = "dsh-vt-gen-ui";
/** Source kind persisted by this plugin in Session format v4. */
const FEEDBACK_SOURCE_KIND = `plugin:${FEEDBACK_PLUGIN_NAME}`;
/** Marker prefix inside the correction text: `[genui-fence-repair #<fingerprint>]`. */
const MARKER_PREFIX = "[genui-fence-repair #";
/** Marker prefix written by older plugin versions. */
const LEGACY_MARKER_PREFIX = "[genui 自修 #";
/** Read one language token (≤3 spaces indent); backticks are invalid in a backtick info string. */
const FENCE_OPEN = /^ {0,3}```[ \t]*([^` \t]+)[ \t]*$/u;
/** Any fence closer (the renderer never nests fences in one body). */
const FENCE_CLOSE = /^ {0,3}```[ \t]*$/u;
/** Upper bound on fences inspected per reply — a reply is text, not a corpus. */
const MAX_FENCES = 40;
/**
* Extract every ```dsh-ui fence from one assistant reply.
*
* @param text - the assistant message text.
* @returns the fences in document order (at most {@link MAX_FENCES}).
*/
function extractDshUiFences(text) {
	const lines = text.split("\n");
	const fences = [];
	let open = null;
	for (let line = 0; line < lines.length; line++) {
		const current = lines[line] ?? "";
		if (open === null) {
			const label = FENCE_OPEN.exec(current)?.[1];
			if (isGenuiFenceLanguage(label)) open = {
				start: line + 1,
				index: fences.length + 1
			};
			continue;
		}
		if (!FENCE_CLOSE.test(current)) continue;
		fences.push({
			raw: lines.slice(open.start, line).join("\n"),
			closed: true,
			index: open.index
		});
		open = null;
		if (fences.length >= MAX_FENCES) return fences;
	}
	if (open !== null && fences.length < MAX_FENCES) fences.push({
		raw: lines.slice(open.start).join("\n"),
		closed: false,
		index: open.index
	});
	return fences;
}
/** Stable, log-safe identity of one fence body (same body → same fingerprint). */
function fenceFingerprint(raw) {
	return createHash("sha256").update(raw.trim()).digest("hex").slice(0, 12);
}
/**
* Validate every fence in a reply the way the DOM channel would render it.
*
* @param text - the assistant message text.
* @returns the fences that would stay a raw code block, in document order.
*/
function fenceFailures(text) {
	const failures = [];
	for (const fence of extractDshUiFences(text)) {
		const detail = fenceFailureDetail(fence);
		if (detail !== null) failures.push({
			index: fence.index,
			fingerprint: fenceFingerprint(fence.raw),
			detail
		});
	}
	return failures;
}
/** `null` when this fence renders; otherwise the reason it does not. */
function fenceFailureDetail(fence) {
	const resolution = resolveFence(fence.raw, { settled: true });
	if (resolution.spec !== null) return null;
	if (!fence.closed) return "error=unterminated_fence\nrequired=closing_fence";
	if (resolution.processed !== null) return droppedNodeFailure(resolution.processed, resolution.value)?.join("\n") ?? ["error=invalid_spec", ...resolution.processed.errors.map((error) => `diagnostic=${JSON.stringify(error)}`)].join("\n");
	return "error=invalid_json\nrepair=failed";
}
/**
* Build the correction input for a reply with unrenderable fences.
*
* @param failures - fences {@link fenceFailures} rejected.
* @returns the message text to steer into the running turn.
*/
function fenceCorrectionText(failures) {
	const body = failures.map((failure) => `fence=${failure.index}\nfingerprint=${failure.fingerprint}\n${failure.detail}`).join("\n\n");
	return `${failures.map((failure) => `${MARKER_PREFIX}${failure.fingerprint}]`).join(" ")}\n\n[genui-fence-repair]\nstatus=render_failed\nfences=${failures.length}\nnext=resend_corrected_fence_only\nrepeat_rendered_content=false\nreply_language=conversation\n\n${body}\n`;
}
/**
* Create the identified user-role message this loop steers.
*
* Mirrors `createUserMessage` from `@deepseek-ai/dsh-llm` (id + role + frozen)
* without a runtime dependency on that package: the node half of this plugin
* deliberately imports no `@deepseek-ai/*` values, so a linked or npm-installed
* copy resolves identically on every host.
*
* @param text - the correction text.
* @param sessionFormatVersion - the format recorded by the active session.
* @returns a frozen user message attributed to this plugin as a notice.
*/
function createFeedbackMessage(text, sessionFormatVersion) {
	const source = sessionFormatVersion >= 4 ? {
		kind: FEEDBACK_SOURCE_KIND,
		form: "notice",
		summary: "genui fence repair requested"
	} : {
		kind: "plugin",
		plugin: FEEDBACK_PLUGIN_NAME,
		form: "notice",
		summary: "genui fence repair requested"
	};
	const message = {
		id: randomUUID(),
		role: "user",
		content: [{
			type: "text",
			text
		}],
		source
	};
	Object.freeze(message.content);
	return Object.freeze(message);
}
/**
* Decide whether this turn boundary should steer a correction — the pure core of
* the loop, so every bound (per-turn cap, per-fence ledger, cancellation) is
* testable without a host.
*
* The decision is driven by FORMAL events only: fences in the reply body, a
* `validate_dsh_ui` call, a delivered body text or a successful `render_ui`
* result. The reasoning block is
* never read here — a draft inside the thinking block is not proof that the model
* chose to deliver it, so it must not change any decision.
*
* @param input - reply text, turn identity, formal signals, and the accounting.
* @returns the correction to send, or null when the loop must stay silent.
*/
function planFenceFeedback(input) {
	if (input.aborted) return null;
	const used = input.correctionsTurn === input.turn ? input.correctionsThisTurn ?? 0 : 0;
	if (used >= 2) return null;
	const failures = fenceFailures(input.text).filter((failure) => !input.correctedSpec.has(failure.fingerprint));
	if (failures.length > 0) return {
		text: fenceCorrectionText(failures),
		fingerprints: failures.map((failure) => failure.fingerprint),
		turn: input.turn,
		kind: "render"
	};
	if (input.validatedThisTurn !== true || input.deliveredThisTurn === true) return null;
	if (input.deliveryRemindedTurns?.has(input.turn) === true) return null;
	return {
		text: missingBodyCorrectionText(input.turn, used + 1, input.renderUiToolEnabled ?? true),
		fingerprints: [],
		turn: input.turn,
		kind: "delivery"
	};
}
/**
* Correction for a validated GenUI turn that reached the boundary without any
* formal delivery.
*
* @param turn - turn that reached the boundary.
* @param attempt - correction number within the shared turn budget.
* @param renderUiToolEnabled - whether the correction may recommend `render_ui`.
* @returns the message text to steer into the running turn.
*/
function missingBodyCorrectionText(turn, attempt = 1, renderUiToolEnabled = true) {
	return `${`${MARKER_PREFIX}turn-${turn}]\n\n[genui-fence-repair]\nstatus=nothing_delivered\nfences=0\nnext=emit_fence_in_body\nrepeat_rendered_content=false\nreply_language=conversation\n\n`}本轮尚未产生正式回答，也没有通过支持的通道交付结果${attempt <= 1 ? "" : `（第 ${attempt} 次提醒）`}。请根据用户当前请求完成正式答复；需要 UI 时，在回答正文输出你最终选定的 dsh-ui 围栏${renderUiToolEnabled ? "，或明确调用 render_ui" : ""}。可以修改或放弃此前候选；不能完成时，请在正文说明原因。\n`;
}
/**
* 将 GenUI 回合中仅含 reasoning 的完整响应转换为宿主已有的可重试空响应错误。
*
* 只有回合边界确实还能发送交付提醒时，才放行原始 stop，
* 让回合正常结束并走到 `agent/turn-stopping` 边界——那里会 steer 一条交付提醒，
* 回合因此继续到下一个 step，模型有机会在同一回合把内容补进正文。
* 提醒发过仍然只有 reasoning，才用 EMPTY_RESPONSE 交给宿主重试兜底。
*
* @param options - LLM stream waterfall 拦截的请求。
* @param source - 本次请求的 provider stream。
* @param state - 当前回合状态；缺省时没有可用提醒，保留宿主重试。
* @param feedbackEnabled - 同回合修正是否启用。关闭时没有提醒可用，保持原有改写行为。
* @returns 原始 stream；仅在提醒已发出、或提醒不可用时改写 reasoning-only 终止。
*/
async function* retryReasoningOnlyGenuiStream(options, source, state, feedbackEnabled = true) {
	const { EMPTY_RESPONSE_CODE, isAgentLoopRequest } = await import("@deepseek-ai/dsh-llm");
	if (!isAgentLoopRequest(options)) {
		yield* source;
		return;
	}
	let hasReasoningBlock = false;
	let hasOtherBlock = false;
	for await (const chunk of source) {
		if (chunk.type === "block-end") {
			if (chunk.block.type === "reasoning") hasReasoningBlock = true;
			else hasOtherBlock = true;
		}
		if (chunk.type === "finish" && chunk.reason.kind === "stop" && hasReasoningBlock && !hasOtherBlock) {
			if (feedbackEnabled && state !== void 0 && state.currentTurn !== void 0 && state.pendingRenders.size === 0 && planFenceFeedback({
				text: "",
				turn: state.currentTurn,
				correctedSpec: state.correctedSpec,
				deliveryRemindedTurns: state.deliveryRemindedTurns,
				validatedThisTurn: state.validatedThisTurn,
				deliveredThisTurn: state.deliveredThisTurn,
				aborted: options.signal?.aborted ?? false,
				correctionsThisTurn: state.correctionsThisTurn,
				correctionsTurn: state.correctionsTurn
			})?.kind === "delivery") {
				yield chunk;
				continue;
			}
			yield {
				type: "finish",
				reason: {
					kind: "error",
					failure: {
						message: "GenUI turn completed with reasoning only and no deliverable response",
						code: EMPTY_RESPONSE_CODE
					}
				}
			};
		} else yield chunk;
	}
}
/** Text of one assistant message's text blocks, in order. */
function textOfContent(content) {
	if (!Array.isArray(content)) return "";
	return content.map((block) => {
		if (typeof block !== "object" || block === null) return "";
		const record = block;
		return record.type === "text" && typeof record.text === "string" ? record.text : "";
	}).filter((part) => part !== "").join("\n");
}
/** 读取 render_ui result protocol 中明确返回的 status。 */
function renderResultStatus(content) {
	const lines = textOfContent(content).split(/\r?\n/u);
	if (lines[0]?.trim() !== "[genui-render]") return void 0;
	for (const line of lines.slice(1)) {
		if (line === "status=rendered") return "rendered";
		if (line === "status=invalid") return "invalid";
	}
}
/** 从 legacy wrapper 与 Session format v4 中提取 tool result 数据。 */
function observedToolResult(message) {
	if (typeof message !== "object" || message === null) return null;
	const record = message;
	if (typeof record.toolCallId === "string") return {
		callId: record.toolCallId,
		isError: record.isError === true,
		content: record.content
	};
	if (!Array.isArray(record.content)) return null;
	const block = record.content.find((part) => typeof part === "object" && part !== null && part.type === "tool-result");
	if (typeof block?.toolCallId !== "string") return null;
	return {
		callId: block.toolCallId,
		isError: block.isError === true,
		content: block.content
	};
}
/** Tool whose SUCCESSFUL result is a formal delivery. */
const DELIVERY_TOOL = "render_ui";
/**
* Whether one assistant message delivered a non-empty body text.
*
* Deliberately narrow: a non-empty text block. A `render_ui` call is decided
* by its `tool/result`, not by the call appearing in a message — a call that
* failed (or whose result has not arrived) is not a delivery. Other tools
* (validate_dsh_ui, bash, …) may succeed without producing any answer, so
* they are NOT counted as delivery.
*
* @param content - assistant content blocks.
* @returns true when this message delivered a body text.
*/
function deliveredBodyText(content) {
	if (!Array.isArray(content)) return false;
	return content.some((block) => {
		if (typeof block !== "object" || block === null) return false;
		const record = block;
		return record.type === "text" && typeof record.text === "string" && record.text.trim() !== "";
	});
}
/** 分类当前与 legacy correction message 中的 marker。 */
function feedbackMarkersIn(text) {
	const renderFingerprints = [];
	const deliveryTurns = [];
	let cursor = 0;
	while (cursor < text.length) {
		const current = text.indexOf(MARKER_PREFIX, cursor);
		const legacy = text.indexOf(LEGACY_MARKER_PREFIX, cursor);
		if (current < 0 && legacy < 0) break;
		const useLegacy = legacy >= 0 && (current < 0 || legacy < current);
		const prefix = useLegacy ? LEGACY_MARKER_PREFIX : MARKER_PREFIX;
		const index = useLegacy ? legacy : current;
		const end = text.indexOf("]", index + prefix.length);
		if (end < 0) break;
		const marker = text.slice(index + prefix.length, end);
		const turn = /^turn-(\d+)$/u.exec(marker);
		if (turn !== null) deliveryTurns.push(Number(turn[1]));
		else renderFingerprints.push(marker);
		cursor = end + 1;
	}
	return {
		renderFingerprints,
		deliveryTurns
	};
}
/** 恢复一条持久化 correction 消耗的 turn budget。 */
function accountReplayedCorrection(state, turn) {
	if (state.correctionsTurn !== turn) {
		state.correctionsTurn = turn;
		state.correctionsThisTurn = 1;
		return;
	}
	state.correctionsThisTurn = Math.min(2, state.correctionsThisTurn + 1);
}
/** Identify this plugin's source across current and migrated session shapes. */
function isFeedbackSource(source) {
	return source?.kind === "plugin:dsh-vt-gen-ui" || source?.kind === "plugin" && source.plugin === "dsh-vt-gen-ui";
}
/**
* 注册 GenUI 回合跟踪、宿主重试判定和可选的围栏修正流程。
*
* @param ctx - 宿主 Context。
* @param enabled - 是否启用同回合围栏修正。
* @param renderUiToolEnabled - 是否已注册 `render_ui` 工具。
*/
function installFenceFeedback(ctx, enabled, renderUiToolEnabled = true) {
	const sessions = /* @__PURE__ */ new Map();
	const stateOf = (sessionId) => {
		let state = sessions.get(sessionId);
		if (state === void 0) {
			state = {
				text: "",
				validatedThisTurn: false,
				isSubagent: false,
				deliveredThisTurn: false,
				pendingRenders: /* @__PURE__ */ new Set(),
				correctedSpec: /* @__PURE__ */ new Set(),
				deliveryRemindedTurns: /* @__PURE__ */ new Set(),
				correctionsThisTurn: 0,
				correctionsTurn: void 0,
				currentTurn: void 0,
				accountedCorrectionMessageIds: /* @__PURE__ */ new Set()
			};
			sessions.set(sessionId, state);
		}
		return state;
	};
	ctx.on("session/disposed", (session) => {
		sessions.delete(String(session.id));
	});
	const resetTurnState = (state, turn) => {
		state.text = "";
		state.validatedThisTurn = false;
		state.deliveredThisTurn = false;
		state.pendingRenders.clear();
		state.currentTurn = turn;
	};
	const observeEvent = (session, event) => {
		const sessionId = String(session.id);
		if (event.type === "turn/start") {
			const state = stateOf(sessionId);
			state.isSubagent = session.header.parentSession !== void 0;
			state.correctedSpec.clear();
			resetTurnState(state, event.data.turn);
			return;
		}
		if (event.type === "assistant/message") {
			const content = event.data.message?.content;
			const text = textOfContent(content);
			const state = stateOf(sessionId);
			state.isSubagent = session.header.parentSession !== void 0;
			state.text = extractDshUiFences(text).length > 0 ? text : "";
			state.deliveredThisTurn = state.deliveredThisTurn || deliveredBodyText(content);
			return;
		}
		if (event.type === "tool/call") {
			const data = event.data;
			const state = stateOf(sessionId);
			state.isSubagent = session.header.parentSession !== void 0;
			if (data.name === "validate_dsh_ui") state.validatedThisTurn = true;
			if (data.name === DELIVERY_TOOL && typeof data.callId === "string") state.pendingRenders.add(data.callId);
			return;
		}
		if (event.type === "tool/result") {
			const data = event.data;
			const result = observedToolResult(data.message);
			if (result === null) return;
			const state = stateOf(sessionId);
			state.isSubagent = session.header.parentSession !== void 0;
			if (!state.pendingRenders.delete(result.callId)) return;
			if (data.error === void 0 && result.isError !== true && renderResultStatus(result.content) === "rendered") state.deliveredThisTurn = true;
			return;
		}
		if (event.type !== "user/message") return;
		const data = event.data;
		if (isFeedbackSource(data.source)) {
			const markers = feedbackMarkersIn(textOfContent(data.content));
			if (markers.renderFingerprints.length === 0 && markers.deliveryTurns.length === 0) return;
			const state = stateOf(sessionId);
			state.isSubagent = session.header.parentSession !== void 0;
			for (const fingerprint of markers.renderFingerprints) state.correctedSpec.add(fingerprint);
			for (const turn of markers.deliveryTurns) state.deliveryRemindedTurns.add(turn);
			if (typeof data.id === "string" && !state.accountedCorrectionMessageIds.has(data.id)) {
				state.accountedCorrectionMessageIds.add(data.id);
				const turn = markers.deliveryTurns[0] ?? state.currentTurn;
				if (turn !== void 0) accountReplayedCorrection(state, turn);
			}
			return;
		}
		if (data.source?.kind !== "user") return;
		const state = sessions.get(sessionId);
		if (state !== void 0) {
			state.isSubagent = session.header.parentSession !== void 0;
			resetTurnState(state, state.currentTurn);
		}
	};
	const restoreHistory = (session) => {
		if (sessions.has(String(session.id))) return;
		for (const event of session.snapshotEvents()) observeEvent(session, event);
	};
	ctx.on("session/event", (session, event) => {
		restoreHistory(session);
		observeEvent(session, event);
	});
	ctx.on("session/created", restoreHistory);
	const restoreSessions = (sessionCtx) => {
		const store = sessionCtx.reflect.get("sessions");
		if (store === void 0) return;
		for (const session of store.list()) restoreHistory(session);
	};
	restoreSessions(ctx);
	ctx.inject(["sessions"], restoreSessions);
	ctx.on("llm/stream", (options, next) => {
		if (options.sessionId === void 0 || options.purpose !== void 0) return next();
		const state = sessions.get(String(options.sessionId));
		if (state?.validatedThisTurn !== true || state.isSubagent) return next();
		return retryReasoningOnlyGenuiStream(options, next(), state, enabled);
	}, { global: true });
	ctx.on("agent/turn-stopping", ({ agent, turn, signal }) => {
		if (!enabled) return;
		if (agent.session.header.parentSession !== void 0) return;
		const state = sessions.get(String(agent.session.id));
		if (state === void 0) return;
		state.currentTurn = turn;
		if (state.pendingRenders.size > 0) return;
		const usedThisTurn = state.correctionsTurn === turn ? state.correctionsThisTurn : 0;
		const plan = planFenceFeedback({
			text: state.text,
			turn,
			correctedSpec: state.correctedSpec,
			deliveryRemindedTurns: state.deliveryRemindedTurns,
			validatedThisTurn: state.validatedThisTurn,
			deliveredThisTurn: state.deliveredThisTurn,
			aborted: signal.aborted,
			correctionsThisTurn: usedThisTurn,
			correctionsTurn: state.correctionsTurn,
			renderUiToolEnabled
		});
		if (plan === null) return;
		for (const fingerprint of plan.fingerprints) state.correctedSpec.add(fingerprint);
		if (plan.kind === "delivery") state.deliveryRemindedTurns.add(plan.turn);
		state.correctionsTurn = plan.turn;
		state.correctionsThisTurn = usedThisTurn + 1;
		try {
			const message = createFeedbackMessage(plan.text, agent.session.header.version);
			state.accountedCorrectionMessageIds.add(message.id);
			agent.steer(message);
		} catch (error) {
			ctx.logger?.warn?.(`dsh-genui: fence feedback steering failed (${error instanceof Error ? error.message : String(error)})`);
		}
	});
}
// src/plugin/index.ts
/**
* The mermaid/three engines ship as standalone IIFE bundles under
* `lib/assets/` and are fetched by the client ONLY when a spec needs them.
* This route serves them from the plugin's own package directory through the
* host webserver service — the longest-prefix rule lets it win over the
* generic `/plugins` bundle route, and no host source change is needed. The
* service is optional at this plugin's start time, so a dependency fiber owns
* the registration and follows the webserver through late binding, replacement,
* and plugin reloads.
*/
/** Route prefix under /plugins; anything under it is this plugin's asset. */
const ASSET_ROUTE_PATH = "/plugins/dsh-vt-gen-ui/assets";
/** Safe flat file names only: no slashes, no traversal, js assets only. */
const ASSET_FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.js$/;
/** The handler itself (registered via the optional webServer probe). */
async function serveGenuiAsset(req, res) {
	if (req.method !== "GET" && req.method !== "HEAD") {
		res.writeHead(405);
		res.end();
		return;
	}
	let pathname;
	try {
		pathname = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
	} catch {
		res.writeHead(400);
		res.end();
		return;
	}
	const rel = pathname.startsWith(`${ASSET_ROUTE_PATH}/`) ? pathname.slice(29) : null;
	if (rel === null) {
		res.writeHead(404);
		res.end();
		return;
	}
	const file = rel.slice(1);
	if (!ASSET_FILE_RE.test(file)) {
		res.writeHead(404);
		res.end();
		return;
	}
	try {
		const dir = fileURLToPath(new URL("./assets/", import.meta.url));
		const body = await readFile(join(dir, file));
		res.writeHead(200, {
			"content-type": "text/javascript; charset=utf-8",
			"cache-control": "no-cache"
		});
		res.end(body);
	} catch {
		res.writeHead(404);
		res.end();
	}
}
const RENDER_UI_TOOL_GUIDANCE = "- Tool channel: render_ui 工具把同一 spec 渲染为工具行卡片；围栏用于回答内联 UI。";
/** The fence language description injected into every assembled system prompt.
*  Deliberately slim: the `genui` skill carries the full component→field
*  mapping; this section keeps only the contract that must always be
*  present (fence syntax, type whitelist, and critical behavioral rules). */
const GENUI_SECTION_TEXT = `Render UI inside your reply with a fenced \`dsh-ui\` JSON block:

\`\`\`dsh-ui
{"title":"示例","gap":14,"items":[{"type":"text","content":"把这里换成你的组件"}]}
\`\`\`

Allowed \`type\` values; the \`genui\` skill, when available, carries the full content→component mapping and per-component field details:

- 布局: text · row · col · grid · card · divider · spacer · hero（封面块，一条回答最多一个）
- 展示: badge · stat · progress · list · table · keyvalue · timeline · file-tree · breadcrumb · callout · steps · diff · json · code · copy · avatar · image · audio · video · icon · blocks · arrow
- 图表: chart {"kind":"bars|line|donut","data":[{"label":"...","value":n}]}（series：bars 分组/堆叠 / line 多序列） · echart (preset 名或 option 直通，清单见 skill) · plot (函数图) · svg (单图预览)
- 交互: button · input · textarea · select · checkbox · switch · slider · radio · submit · quiz · link · tabs · accordion（row.justify / col.width / card.flat 见图元）
- 高级: mermaid (流程图/时序/甘特/ER 等，关键字见 skill) · diagram (架构/流程图) · scene3d (3D WebGL)

**默认就该出 UI**：出现下列情况至少出一个围栏：
- ≥3 条并列要点 → \`list\`；数字对比 → \`table\`；指标/进度/状态 → \`stat\`/\`progress\`/\`badge\`
- 步骤/时间线 → \`steps\`/\`timeline\`/\`mermaid\`；架构/流程 → \`diagram\` 或 \`mermaid\`；单条风险/结论摘要 → \`callout\`；代码/改动 → \`code\`/\`diff\`/\`json\`
- 行内富文本：支持公式、\`code\`、加粗、高亮、链接；禁用 Markdown table 与 fenced code，改用 table/code/diff/json。
- 默认无卡：卡片用于并排项、数据对象或需底色的风险清单。

**发回答前最后自检一次**：有没有 ≥3 条并列要点、任何对比、任何数字/指标、任何步骤或流程？有就先转成组件。**状态汇报、进度说明、提交与改动清单同样算**。
- 趋势/占比 → \`chart\`（≤8 点）或 \`echart\`；配色跟随主题，语义需要时才用 \`palette\`/\`card.accent\`；grid 子节点用 \`"span":2\` 做宽窄混排；数据多时给 \`table\`/\`list\` 配 \`input\`(id)+\`filter\` 就地筛选。
- 多组件回答先套 skill「编排范式」，别一行一个往下堆；章节分隔 \`divider\` 带 \`label\`。

**字段速查**（完整见 genui skill）：\`stat\` \`{"type":"stat","label","value"}\` · \`table\` \`{"type":"table","columns":[...],"rows":[[...]]}\` · \`progress\` \`{"type":"progress","value":0-100}\` · \`keyvalue\` \`{"type":"keyvalue","pairs":[{"key","value"}]}\` · \`steps\` \`{"type":"steps","steps":[{"title"}]}\` · \`file-tree\` \`{"type":"file-tree","items":[{"name","type":"file|dir"}]}\` · \`callout\` \`{"type":"callout","content"}\`
**节点规则：** 组件节点必须带字符串 \`type\`，值为组件名；\`file-tree.items[].type\` 表示 \`file\` 或 \`dir\`。

**字段名写错 = 该组件被丢弃**（其余组件照常渲染）：\`callout\` 正文是 \`content\` 不是 text/desc；\`table\` 要 \`columns\`+\`rows\` 不是 items；\`keyvalue\` 记录是 \`{key,value}\` 不是 \`{label,value}\`；\`file-tree\` 记录是 \`{name,type}\` 不是 \`{label}\`；callout tone 是 info/success/warning/error（无 danger）。不确定就调 \`validate_dsh_ui\`。

Rules:
- LANGUAGE: reply+UI=conversation language; schema fixed. NEVER infer it from prompt/skill/examples/tools. Replace \`<user-language ...>\`; never emit these placeholders literally.
- JSON 严格：坏组件被丢弃，坏围栏变代码块；≥3 节点或含 table 时调 validate_dsh_ui，按诊断修改并重验；小围栏字段存疑也先验证。
- warning=block_markdown：按 replacement 改写并重验。
- 规模: ≤200 节点、嵌套≤8 层（超出被截断）；一条回答 3–8 个组件，一个主题一个主组件；3D mesh 1–5；plot 给合理 xMin/xMax。
- LOCAL-FIRST + actions: UI 能自己做的状态变化（判卷、判题、重置、展开、选中）就地完成，零往返；action 只用于必须模型参与的事。交互以 [genui-action] name + 组件数据回传，届时重渲染更新 UI；无 action 的按钮禁用。
- Durable state: 交互状态按「会话+内容指纹」持久化——刷新/重放恢复；相同内容保留，新内容重置。
- 卷子模式: 每题一个 radio（group+answer+explanation）+ 一个 submit（groups 全列），本地判分。
- Secrets ban: 不索取密码、API Key、Token、恢复码；需要时拒绝并解释。
${RENDER_UI_TOOL_GUIDANCE}
- 围栏位置：\`dsh-ui\` 只写在**回答正文**；写在 reasoning/思考块里不渲染、用户看不到——思考里验证好 spec，正文再输出同一份。
- Panel: "panel":true 只渲染进会话面板 dock 并原地更新；"append":true 追加合并；上限 200 节点/200 次追加，满了发 replace 重建。面板来的 [genui-action] 只回一个 panel:true 围栏 + 至多一行 10 字内确认。`;
/**
* Register the GenUI output-language section and the render_ui tool.
* @param ctx - cordis context.
*/
const name = "dsh-vt-gen-ui";
const inject = ["systemPrompt"];
const BUNDLED_SKILL_RANK = 600;
const BUNDLED_SKILL_PROVIDER = "dsh-vt-gen-ui";
const BUNDLED_SKILL_INVOCATION = {
	modelInvocable: true,
	userInvocable: true
};
/**
* The frontmatter field the routing description comes from.
*
* A second copy of this sentence in code drifted from SKILL.md unnoticed, and the
* panel showed the code copy while the model read the same string — so an edit to
* the skill's own frontmatter changed nothing. The file is the only source.
*/
function frontmatterField(front, key) {
	return new RegExp("^\\s*" + key + "\\s*:\\s*(.+?)\\s*$", "mu").exec(front)?.[1]?.replace(/^['"]|['"]$/gu, "");
}
/** Register through the provider path so source=bundled also gets bundled precedence. */
function bundledSkillProvider() {
	const moduleDirectory = dirname(fileURLToPath(new URL(import.meta.url)));
	const path = basename(moduleDirectory) === "plugin" ? resolve(moduleDirectory, "../../SKILL.md") : resolve(moduleDirectory, "../SKILL.md");
	const raw = readFileSync(path, "utf8");
	const end = raw.indexOf("\n---\n", 4);
	if (!raw.startsWith("---\n") || end < 0) throw new Error("genui SKILL.md has invalid frontmatter");
	const description = frontmatterField(raw.slice(4, end), "description");
	if (description === void 0) throw new Error("genui SKILL.md frontmatter has no description");
	return {
		name: BUNDLED_SKILL_PROVIDER,
		list: () => Promise.resolve([{
			name: "genui",
			description,
			invocation: BUNDLED_SKILL_INVOCATION,
			source: "bundled",
			provider: BUNDLED_SKILL_PROVIDER,
			path,
			resourceBase: {
				kind: "directory",
				path: dirname(path)
			},
			rank: BUNDLED_SKILL_RANK,
			locator: path
		}]),
		get: () => Promise.resolve({
			name: "genui",
			description,
			invocation: BUNDLED_SKILL_INVOCATION,
			source: "bundled",
			provider: BUNDLED_SKILL_PROVIDER,
			path,
			resourceBase: {
				kind: "directory",
				path: dirname(path)
			},
			content: raw.slice(end + 5)
		})
	};
}
function apply(ctx, config) {
	const renderUiToolEnabled = config?.renderUiTool !== false;
	ctx.systemPrompt.section({
		name: "genui:fence",
		order: ctx.systemPrompt.getSectionOrder("STRUCTURED_OUTPUT"),
		text: renderUiToolEnabled ? GENUI_SECTION_TEXT : GENUI_SECTION_TEXT.replace(`${RENDER_UI_TOOL_GUIDANCE}\n`, "")
	});
	installFenceFeedback(ctx, config?.fenceFeedback !== false, renderUiToolEnabled);
	ctx.inject(["tools"], (toolsCtx) => {
		toolsCtx.effect(function* () {
			if (renderUiToolEnabled) yield toolsCtx.tools.register(createRenderUiTool());
			yield toolsCtx.tools.register(createValidateDshUiTool());
		}, "dsh-genui: model tools");
	});
	ctx.inject(["skills"], (skillCtx) => {
		skillCtx.skills.registerProvider(() => bundledSkillProvider());
	});
	ctx.inject(["webServer"], (webCtx) => {
		const webServer = webCtx.reflect.get("webServer");
		webCtx.effect(() => webServer.register({
			kind: "prefix",
			path: ASSET_ROUTE_PATH,
			handler: serveGenuiAsset
		}), "dsh-genui: asset route");
	});
}
export { GENUI_SECTION_TEXT, apply, inject, name };
