import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { useSkillDefinitions } from "../src/hooks/useSkillDefinitions.js";

function skillService(context) {
    const calls = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (url, options) => new Promise((resolve) => {
        calls.push({
            url, options,
            reply: (data, status = 200) => resolve(new Response(JSON.stringify(data), { status })),
        });
    });
    context.after(() => { globalThis.fetch = originalFetch; });

    // Capture the request API without browser effects, polling or DOM timers.
    let service;
    function Capture() {
        service = useSkillDefinitions();
        return null;
    }
    renderToString(createElement(Capture));
    return { service, calls };
}

test("equivalent concurrent configurations share one POST and a resolved cache entry", async (context) => {
    const { service, calls } = skillService(context);
    const first = service.fetchSkillData("org.skills.Example", { z: " 'a\\'b' ", a: " @count ", ignored: null });
    const second = service.fetchSkillData("org.skills.Example", { a: "@count", z: "a'b" });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "/api/skill/org.skills.Example");
    assert.equal(calls[0].options.method, "POST");
    assert.deepEqual(JSON.parse(calls[0].options.body), { params: { z: "a'b", a: "@count" } });
    calls[0].reply({ definition: "configured" });
    const [firstData, secondData] = await Promise.all([first, second]);
    assert.equal(firstData, secondData);
    assert.equal(await service.fetchSkillData("org.skills.Example", { z: "a'b", a: "@count" }), firstData);
    assert.equal(calls.length, 1);
});

test("empty configurations use the base GET while zero and false remain POST parameters", async (context) => {
    const { service, calls } = skillService(context);
    const base = service.fetchSkillData("Example", { absent: undefined, missing: null });
    assert.equal(calls[0].options.cache, "no-store");
    assert.equal(calls[0].options.method, undefined);
    calls[0].reply({ definition: "base" });
    await base;
    const configured = service.fetchSkillData("Example", { enabled: false, count: 0 });
    assert.deepEqual(JSON.parse(calls[1].options.body), { params: { enabled: false, count: 0 } });
    calls[1].reply({ definition: "configured" });
    await configured;
});

test("library refresh invalidates pending definitions and old replies cannot replace new requests", async (context) => {
    const { service, calls } = skillService(context);
    const old = service.fetchSkillData("Example", { count: "1" });
    const refresh = service.fetchSkills();
    calls[1].reply({ skills: ["Example"] });
    assert.equal(await refresh, true);

    const fresh = service.fetchSkillData("Example", { count: "1" });
    assert.equal(calls.length, 3);
    calls[0].reply({ definition: "old" });
    assert.deepEqual(await old, { definition: "old" });
    const sharedFresh = service.fetchSkillData("Example", { count: "1" });
    assert.equal(calls.length, 3);
    calls[2].reply({ definition: "new" });
    const [freshData, sharedData] = await Promise.all([fresh, sharedFresh]);
    assert.equal(freshData, sharedData);
    assert.deepEqual(freshData, { definition: "new" });
    assert.equal(await service.fetchSkillData("Example", { count: "1" }), freshData);
    assert.equal(calls.length, 3);
});

test("failed base requests are removed from the cache and can be retried", async (context) => {
    context.mock.method(console, "error", () => {});
    const { service, calls } = skillService(context);
    const failed = service.fetchSkillData("Example");
    calls[0].reply({ error: "unavailable" }, 500);
    assert.equal(await failed, null);
    const retry = service.fetchSkillData("Example");
    assert.equal(calls.length, 2);
    calls[1].reply({ definition: "retried" });
    assert.deepEqual(await retry, { definition: "retried" });
});

test("parameterized failures share the base fallback with concurrent base callers", async (context) => {
    context.mock.method(console, "warn", () => {});
    const { service, calls } = skillService(context);
    const configured = service.fetchSkillData("Example", { count: "1" });
    calls[0].reply({ error: "invalid configuration" }, 400);
    await setImmediate();
    assert.equal(calls.length, 2);
    assert.equal(calls[1].options.cache, "no-store");
    const base = service.fetchSkillData("Example");
    assert.equal(calls.length, 2);
    calls[1].reply({ definition: "fallback" });
    const [configuredData, baseData] = await Promise.all([configured, base]);
    assert.equal(configuredData, baseData);
    assert.equal(await service.fetchSkillData("Example", { count: "1" }), baseData);
    assert.equal(calls.length, 2);
});

test("older overlapping library replies neither change the signature nor clear fresh definitions", async (context) => {
    const { service, calls } = skillService(context);
    const old = service.fetchSkills({ manual: true });
    const fresh = service.fetchSkills({ manual: true });
    calls[1].reply({ skills: ["New"] });
    assert.equal(await fresh, true);
    const definition = service.fetchSkillData("New");
    calls[2].reply({ definition: "fresh" });
    const data = await definition;
    calls[0].reply({ skills: ["Old"] });
    assert.equal(await old, false);
    assert.equal(await service.fetchSkillData("New"), data);
    assert.equal(calls.length, 3);
});
