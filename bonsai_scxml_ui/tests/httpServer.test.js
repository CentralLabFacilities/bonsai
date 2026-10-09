import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createRequestHandler } from "../src/httpServer.js";

const assets = {
    "/index.html": Buffer.from("<html>editor</html>").toString("base64"),
    "/assets/app.js": Buffer.from("export default 42;").toString("base64"),
    "/assets/help.gif": Buffer.from([71, 73, 70]).toString("base64"),
};

async function listen(context, handler) {
    const server = createServer(handler);
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    context.after(() => new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
        server.closeAllConnections();
    }));
    return `http://127.0.0.1:${server.address().port}`;
}

test("embedded assets retain content and MIME type on repeated requests", async (context) => {
    const base = await listen(context, createRequestHandler(assets, { apiTarget: null }));
    for (let i = 0; i < 2; i += 1) {
        const response = await fetch(`${base}/assets/app.js?v=1`);
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("content-type"), "application/javascript; charset=utf-8");
        assert.equal(await response.text(), "export default 42;");
    }
    const image = await fetch(`${base}/assets/help.gif`);
    assert.equal(image.headers.get("content-type"), "image/gif");
    assert.deepEqual(new Uint8Array(await image.arrayBuffer()), new Uint8Array([71, 73, 70]));
});

test("root and application routes return the SPA without hiding missing assets", async (context) => {
    const base = await listen(context, createRequestHandler(assets, { apiTarget: null }));
    for (const pathname of ["/", "/workflows/example", "/apiary"]) {
        const response = await fetch(`${base}${pathname}`);
        assert.equal(response.status, 200);
        assert.equal(await response.text(), "<html>editor</html>");
    }
    for (const pathname of ["/missing.js", "/missing.mjs", "/missing.gif"]) {
        assert.equal((await fetch(`${base}${pathname}`)).status, 404);
    }
});

test("HEAD requests do not return a body", async (context) => {
    const base = await listen(context, createRequestHandler(assets, { apiTarget: null }));
    const response = await fetch(`${base}/assets/app.js`, { method: "HEAD" });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "");
});

test("missing index returns an explicit server error", async (context) => {
    const base = await listen(context, createRequestHandler({}, { apiTarget: null }));
    const response = await fetch(`${base}/`);
    assert.equal(response.status, 500);
    assert.equal(await response.text(), "Internal server error");
});

test("API proxy preserves queries, bodies and upstream responses", async (context) => {
    const upstream = await listen(context, async (request, response) => {
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        response.writeHead(202, { "Content-Type": "application/json", "X-Upstream": "yes" });
        response.end(JSON.stringify({
            path: request.url,
            method: request.method,
            body: Buffer.concat(chunks).toString(),
            host: request.headers.host,
        }));
    });
    const base = await listen(context, createRequestHandler(assets, { apiTarget: upstream }));
    const response = await fetch(`${base}/api/configure?skill=test`, { method: "POST", body: '{"parameter":1}' });
    assert.equal(response.status, 202);
    assert.equal(response.headers.get("x-upstream"), "yes");
    assert.deepEqual(await response.json(), {
        path: "/configure?skill=test", method: "POST", body: '{"parameter":1}', host: new URL(upstream).host,
    });
    assert.equal((await (await fetch(`${base}/api`)).json()).path, "/");
    assert.equal(await (await fetch(`${base}/apiary`)).text(), "<html>editor</html>");
});

test("unreachable upstream returns 502 without crashing the server", async (context) => {
    const errors = [];
    const base = await listen(context, createRequestHandler(assets, {
        apiTarget: "http://127.0.0.1:1",
        logger: { error: (...args) => errors.push(args) },
    }));
    const response = await fetch(`${base}/api/skills`);
    assert.equal(response.status, 502);
    assert.equal(await response.text(), "Bad Gateway");
    assert.equal(errors.length, 1);
    assert.equal((await fetch(`${base}/`)).status, 200);
});

test("unsupported upstream schemes are rejected at startup", () => {
    assert.throws(() => createRequestHandler(assets, { apiTarget: "file:///private" }), /HTTP or HTTPS/);
});
