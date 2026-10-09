import assert from "node:assert/strict";
import test from "node:test";
import { rebuildBoundaryTransitions } from "../src/utils/boundaryTransitions.js";
import { buildActiveValidationRequest, buildEditorValidationRequest } from "../src/utils/editorValidation.js";
import { prepareGraphForScxml } from "../src/utils/editorScxml.js";
import { buildRustEditorExportRequest, buildRustEditorStructureSnapshot } from "../src/utils/scxmlRustExport.js";
import { transitionDescriptorCovers } from "../src/utils/transitionEvents.js";

test("child descriptor coverage preserves partial, conditional and namespace distinctions", () => {
    assert.equal(transitionDescriptorCovers("*", "*"), true);
    assert.equal(transitionDescriptorCovers("error.*", "error.not_found"), true);
    assert.equal(transitionDescriptorCovers("error", "error.*"), true);
    assert.equal(transitionDescriptorCovers("error.*", "error"), true);
    assert.equal(transitionDescriptorCovers("success", "*"), false);
    assert.equal(transitionDescriptorCovers("error.*", "fatal"), false);
    assert.equal(transitionDescriptorCovers("error", "errorish"), false);
    assert.equal(transitionDescriptorCovers("success error", "success error.not_found"), true);
    assert.equal(transitionDescriptorCovers("", ""), false);
});

test("managed boundary provenance is synthetic in both validation payloads without hiding real events", () => {
    const managed = { id: "imported-skill-node-Talk.*", sourceNodeId: "talk", transitionHandleId: "*" };
    const nodes = [
        { id: "compound", type: "compound", data: { events: [managed, { id: "genuine" }] } },
        { id: "lane", type: "parallelLane", data: { events: [managed] } },
        { id: "talk", type: "custom", data: { events: [managed] } },
    ];
    for (const projected of [buildEditorValidationRequest({ nodes }).nodes, buildActiveValidationRequest({ nodes }).nodeOverlays]) {
        assert.equal(projected[0].events[0].synthetic, true);
        assert.equal(projected[0].events[1].synthetic, false);
        assert.equal(projected[1].events[0].synthetic, true);
        assert.equal(projected[2].events[0].synthetic, false);
    }
});

const state = (id, scxmlId, parentId = null, kind = "skill", editor = {}) => ({
    id, scxmlId, fullSkillName: scxmlId, label: scxmlId.split(".").at(-1).split("#")[0], kind, parentId,
    parameters: [], slots: [], events: [], onEntry: [], onExit: [],
    editor: { x: 10, y: 20, positions: [{ x: 10, y: 20, instanceId: id }], ...editor },
});
const fixture = ({ childEvent = "Talk.*", condition = "", targeted = true, nested = false, clone = false } = {}) => ({
    initialStateId: "setup", initialScxmlStateId: "ExecSetup", dataModel: [], slotDeclarations: [],
    states: [
        { ...state("setup", "ExecSetup", null, "compound"), initialChildScxmlId: nested ? "Nested" : "dialog.Talk#inside" },
        ...(nested ? [{ ...state("nested", "Nested", "setup", "compound"), initialChildScxmlId: "dialog.Talk#inside" }] : []),
        state("talk-in", "dialog.Talk#inside", nested ? "nested" : "setup", "skill", clone ? { positions: [
            { x: 10, y: 20, instanceId: "inside" }, { x: 30, y: 20, instanceId: "alias", cloneType: "skill" },
        ] } : {}),
        state("move", "motion.Move#inside", nested ? "nested" : "setup"),
        state("talk-out", "dialog.Talk#outside", "setup"),
        state("end", "End", null, "final"),
    ],
    transitions: [
        { id: "outside", sourceStateId: "setup", targetStateId: "end", targetScxmlId: "End", event: "Talk.*", condition: "", assignments: [] },
        ...(childEvent === null ? [] : [{ id: "inside", sourceStateId: nested ? "nested" : "talk-in",
            targetStateId: targeted ? "move" : null, targetScxmlId: targeted ? "motion.Move#inside" : null,
            event: childEvent, condition, assignments: [] }]),
    ],
});

test("import keeps repeated skill instances scoped to their actual SCXML transition owners", async (context) => {
    const { createServer } = await import("vite");
    const server = await createServer({ configFile: false, appType: "custom", server: { middlewareMode: true, hmr: false,
        ws: false, watch: { ignored: () => true } }, optimizeDeps: { noDiscovery: true, include: [] } });
    context.after(() => server.close());
    const { parseScxmlFile } = await server.ssrLoadModule("/src/utils/scxmlImport.js");
    const project = async (options) => {
        let next = 0;
        return parseScxmlFile("", async () => ({ params: [], inSlots: [], outSlots: [], events: [{ event: "success" }, { event: "error" }] }),
            () => `skill-node-${++next}`, fixture(options));
    };
    const read = (graph) => {
        const setup = graph.nodes.find((node) => node.type === "compound" && node.data.label === "ExecSetup");
        const inside = graph.nodes.find((node) => node.data.fullSkillName === "dialog.Talk#inside" && !node.data.isSkillClone);
        const outside = graph.nodes.find((node) => node.data.fullSkillName === "dialog.Talk#outside");
        const move = graph.nodes.find((node) => node.data.fullSkillName === "motion.Move#inside");
        const end = graph.nodes.find((node) => node.data.isFinal);
        const boundary = graph.edges.find((edge) => edge.source === setup.id && edge.target === end.id);
        return { setup, inside, outside, move, end, boundary };
    };
    await context.test("normal path-only and inherited declarations survive editor projection and resave", async () => {
        const workflow = fixture();
        workflow.slotDeclarations = [
            { key: "", state: "", xpath: "/needed", inherited: false },
            { key: "input", state: "dialog.Talk#inside", xpath: "/from-parent", inherited: true },
            { key: "", state: "", xpath: "", inherited: false },
        ];
        let next = 0;
        const graph = await parseScxmlFile("", async () => ({ params: [], events: [],
            inSlots: [{ key: "input", type: "String" }], outSlots: [] }), () => `node-${++next}`, workflow);
        assert.equal(graph.manualSlots.length, 2);
        assert.deepEqual(graph.manualSlots[0], { id: "imported-slot-declaration-0", path: "/needed", key: "", state: "", type: "Unknown", slotKind: "slot", inherited: null });
        assert.equal(graph.manualSlots[1].path, "/from-parent");
        assert.equal(graph.manualSlots[1].type, "String");
        assert.equal(graph.manualSlots[1].slotKind, "inheritSlot");
        assert.deepEqual(graph.manualSlots[1].inherited, { state: "dialog.Talk#inside", xpath: "/from-parent" });
        const exported = buildRustEditorExportRequest({ nodes: graph.nodes, edges: graph.edges, manualSlots: graph.manualSlots, globalDataModel: graph.globalDataModel });
        assert.ok(exported.extraSlotDeclarations.some((declaration) => declaration.xpath === "/needed" && !declaration.inherited && declaration.key === "" && declaration.state === ""));
        assert.ok(exported.extraSlotDeclarations.some((declaration) => declaration.xpath === "/from-parent" && declaration.inherited));
        assert.deepEqual(workflow.slotDeclarations[0], { key: "", state: "", xpath: "/needed", inherited: false });
    });
    const sources = (boundary) => (boundary.data.boundaryOriginalSources || [{ sourceId: boundary.data.boundaryOriginalSource }]).map((entry) => entry.sourceId);

    await context.test("only the unhandled Talk uses the compound boundary; internal edge stays inside", async () => {
        const graph = await project();
        const { setup, inside, outside, move, boundary } = read(graph);
        assert.deepEqual(sources(boundary), [outside.id]);
        assert.ok(graph.edges.some((edge) => edge.source === inside.id && edge.target === move.id));
        assert.equal(graph.edges.some((edge) => edge.source === inside.id && edge.target === setup.id), false);
        assert.ok(graph.edges.some((edge) => edge.source === outside.id && edge.target === setup.id && edge.data.boundaryInternalEdge));
        assert.equal(setup.data.events.find((event) => event.sourceNodeId === outside.id).editorBoundarySynthetic, true);
        const rebuilt = rebuildBoundaryTransitions(graph.nodes, graph.edges);
        const managed = rebuilt.nodes.find((node) => node.id === setup.id).data.events.find((event) => event.sourceNodeId === outside.id);
        assert.equal(managed.editorBoundarySynthetic, true);
        const exported = buildRustEditorStructureSnapshot({ preparedGraph: prepareGraphForScxml(rebuilt.nodes, rebuilt.edges) });
        assert.deepEqual(exported.edges.find((edge) => edge.target === read(graph).end.id).logicalSources, [{ stateId: outside.id, handle: "*" }]);
        assert.equal(exported.nodes.find((node) => node.id === setup.id).events.some((event) => event.id.startsWith("imported-")), false);
    });
    for (const options of [{ childEvent: null }, { childEvent: "Talk.success" }, { condition: "ready == true" }]) {
        await context.test(`partial or conditional handlers retain eligible ancestors: ${JSON.stringify(options)}`, async () => {
            const graph = await project(options);
            const { inside, outside, boundary } = read(graph);
            assert.deepEqual(sources(boundary), [inside.id, outside.id]);
        });
    }
    await context.test("targetless unconditional handlers still shadow the parent", async () => {
        const graph = await project({ targeted: false });
        const { outside, boundary } = read(graph);
        assert.deepEqual(sources(boundary), [outside.id]);
    });
    await context.test("a nearer compound handler shadows the outer handler without erasing its own edge", async () => {
        const graph = await project({ nested: true });
        const { outside, move, boundary } = read(graph);
        assert.deepEqual(sources(boundary), [outside.id]);
        assert.ok(graph.edges.some((edge) => edge.target === move.id));
    });
    await context.test("visual skill aliases do not become independent wildcard emitters", async () => {
        const graph = await project({ childEvent: null, clone: true });
        const { inside, outside, boundary } = read(graph);
        assert.deepEqual(sources(boundary), [inside.id, outside.id]);
        assert.ok(graph.nodes.some((node) => node.data.isSkillClone));
    });
});
