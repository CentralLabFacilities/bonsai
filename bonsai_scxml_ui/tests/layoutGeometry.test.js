import assert from "node:assert/strict";
import test from "node:test";
import { getOverviewLayoutNodeSize } from "../src/utils/layoutUtils.js";

test("initial skill layout reserves the badge and instance-label header", () => {
    const skill = { id: "skill", type: "custom", data: { initial: true, label: "Work", fullSkillName: "demo.Work#1" } };
    assert.equal(getOverviewLayoutNodeSize(skill).width, 260);
    const instance = { ...skill, data: { ...skill.data, editorInstanceId: "12345678901234567890" } };
    assert.equal(getOverviewLayoutNodeSize(instance).width, 150 + "Work #12345678901234567890".length * 7);
    const wide = { ...skill, data: { ...skill.data, label: "Long initial skill ".repeat(20) } };
    assert.equal(getOverviewLayoutNodeSize(wide).width, 520);
    assert.equal(getOverviewLayoutNodeSize({ ...skill, data: { ...skill.data, isSkillClone: true } }).height, 72);
});

test("overview reserves distinct 24px event hit rows including one implicit fatal", () => {
    const skill = { type: "custom", data: { fullSkillName: "demo.Work#1", events: [{ id: "done" }, { id: "done" }, { id: "error" }] } };
    assert.equal(getOverviewLayoutNodeSize(skill).height, 52 + 3 * 24);
    assert.equal(getOverviewLayoutNodeSize({ ...skill, data: { ...skill.data, events: [...skill.data.events, { id: "fatal" }] } }).height,
        getOverviewLayoutNodeSize(skill).height);
    assert.equal(getOverviewLayoutNodeSize({ ...skill, type: "submachine" }).height, 66 + 2 * 24);
    assert.equal(getOverviewLayoutNodeSize({ ...skill, data: { ...skill.data, isFinal: true } }).height, 58);
});
