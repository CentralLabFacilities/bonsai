import * as http from "node:http";
import * as https from "node:https";
import { extname } from "node:path";

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".mjs": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
};

export function createRequestHandler(assets, { apiTarget = "http://localhost:8080", logger = console } = {}) {
    const embeddedAssets = new Map(Object.entries(assets));
    const decodedAssets = new Map();
    const target = apiTarget ? new URL(apiTarget) : null;
    if (target && !["http:", "https:"].includes(target.protocol)) {
        throw new Error("API_TARGET must use HTTP or HTTPS.");
    }
    const transport = target?.protocol === "https:" ? https : http;

    function decodedAsset(pathname) {
        if (!embeddedAssets.has(pathname)) return null;
        if (!decodedAssets.has(pathname)) {
            decodedAssets.set(pathname, Buffer.from(embeddedAssets.get(pathname), "base64"));
        }
        return decodedAssets.get(pathname);
    }

    function serveStatic(pathname, response) {
        if (pathname === "/") pathname = "/index.html";
        const content = decodedAsset(pathname);
        if (content !== null) {
            response.writeHead(200, { "Content-Type": MIME_TYPES[extname(pathname)] || "application/octet-stream" });
            response.end(content);
            return;
        }

        if (Object.hasOwn(MIME_TYPES, extname(pathname)) && extname(pathname) !== ".html") {
            response.writeHead(404, { "Content-Type": "text/plain" });
            response.end("Not found");
            return;
        }

        const index = decodedAsset("/index.html");
        response.writeHead(index === null ? 500 : 200, {
            "Content-Type": index === null ? "text/plain" : MIME_TYPES[".html"],
        });
        response.end(index === null ? "Internal server error" : index);
    }

    function proxyApi(request, response, url) {
        const proxyRequest = transport.request({
            hostname: target.hostname,
            port: target.port || (target.protocol === "https:" ? 443 : 80),
            path: `${url.pathname.slice(4) || "/"}${url.search}`,
            method: request.method,
            headers: { ...request.headers, host: target.host },
        }, (proxyResponse) => {
            response.writeHead(proxyResponse.statusCode, proxyResponse.headers);
            proxyResponse.on("error", (error) => response.destroy(error));
            proxyResponse.pipe(response);
        });

        proxyRequest.on("error", (error) => {
            if (response.destroyed) return;
            logger.error("Proxy error:", error.message);
            if (response.headersSent) {
                response.destroy(error);
            } else {
                response.writeHead(502, { "Content-Type": "text/plain" });
                response.end("Bad Gateway");
            }
        });
        request.on("aborted", () => proxyRequest.destroy());
        response.on("close", () => {
            if (!response.writableEnded) proxyRequest.destroy();
        });
        request.pipe(proxyRequest);
    }

    return (request, response) => {
        const url = new URL(request.url, "http://localhost");
        if (target && (url.pathname === "/api" || url.pathname.startsWith("/api/"))) {
            proxyApi(request, response, url);
        } else {
            serveStatic(url.pathname, response);
        }
    };
}
