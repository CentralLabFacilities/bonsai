package de.unibi.citec.clf.bonsai.engine.communication.web.memory;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import de.unibi.citec.clf.bonsai.core.configuration.IObjectConfigurator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException;
import de.unibi.citec.clf.bonsai.core.exception.CoreObjectCreationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.WorkingMemory;
import org.apache.log4j.Logger;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Bonsai working memory with its own read-only HTTP interface.
 *
 * The server belongs to this working memory, not to the SCXML starter.
 * Its lifetime ends when the memory or owning factory is cleaned up.
 */
public final class WebSupportMemory implements WorkingMemory, AutoCloseable {
    public record SlotInfo(String path, String type) { }
    public record SlotValue(String path, String type, String value) { }

    public static final String PORT_PROPERTY = "bonsai.memory.web.port";
    private static final Logger LOG = Logger.getLogger(WebSupportMemory.class);
    private final WorkingMemory delegate;
    private final Map<String, WebSlot<?>> slots = new LinkedHashMap<>();
    private final HttpServer server;
    private boolean closed;

    /** Start the server immediately, bound to loopback on port 8081 by default. */
    public WebSupportMemory(WorkingMemory delegate) {
        this(delegate, configuredPort());
    }

    // Package-private so tests can request a free ephemeral port without global properties.
    WebSupportMemory(WorkingMemory delegate, int port) {
        this.delegate = Objects.requireNonNull(delegate, "delegate");
        try {
            server = HttpServer.create(
                    new InetSocketAddress(InetAddress.getByName("127.0.0.1"), port), 0);
            server.createContext("/getUsedSlots", exchange -> {
                if (!checkRequest(exchange, "/getUsedSlots")) return;
                try {
                    StringBuilder json = new StringBuilder("[");
                    List<SlotInfo> registered = getUsedSlots();
                    for (int i = 0; i < registered.size(); i++) {
                        if (i > 0) json.append(',');
                        SlotInfo slot = registered.get(i);
                        json.append("{\"path\":").append(jsonString(slot.path()))
                                .append(",\"type\":").append(jsonString(slot.type())).append('}');
                    }
                    respond(exchange, 200, json.append(']').toString());
                } catch (RuntimeException error) {
                    serverError(exchange, error);
                }
            });
            server.createContext("/getSlot", exchange -> {
                if (!checkRequest(exchange, "/getSlot")) return;
                try {
                    String path = queryParameter(exchange.getRequestURI().getRawQuery(), "path");
                    if (path == null || path.isBlank()) {
                        respond(exchange, 400, "{\"error\":\"Missing slot path\"}");
                        return;
                    }
                    SlotValue slot = getSlotValue(path);
                    if (slot == null) {
                        respond(exchange, 404, "{\"error\":\"Slot not found\",\"path\":"
                                + jsonString(path) + "}");
                        return;
                    }
                    respond(exchange, 200, "{\"path\":" + jsonString(slot.path())
                            + ",\"type\":" + jsonString(slot.type())
                            + ",\"value\":" + jsonString(slot.value()) + "}");
                } catch (CommunicationException | RuntimeException error) {
                    serverError(exchange, error);
                }
            });
            server.start();
            LOG.info("WebSupportMemory listening on http://127.0.0.1/bonsai:" + getPort());
        } catch (IOException failure) {
            throw new CoreObjectCreationException("Could not start WebSupportMemory HTTP server", failure);
        }
    }

    private static int configuredPort() {
        String value = System.getProperty(PORT_PROPERTY, "8080");
        try {
            int port = Integer.parseInt(value);
            if (port >= 1 && port <= 65535) return port;
        } catch (NumberFormatException ignored) { }
        throw new IllegalArgumentException("Invalid " + PORT_PROPERTY + " port: " + value);
    }

    public int getPort() { return server.getAddress().getPort(); }

    @Override
    @SuppressWarnings("unchecked")
    public synchronized <T> MemorySlot<T> getSlot(String path, Class<T> dataType)
            throws CommunicationException, CoreObjectCreationException {
        ensureOpen();
        // The delegate enforces type compatibility for previously registered paths.
        MemorySlot<T> raw = delegate.getSlot(path, dataType);
        WebSlot<?> previous = slots.get(path);
        if (previous != null) return (MemorySlot<T>) previous;
        WebSlot<T> slot = new WebSlot<>(raw);
        slots.put(path, slot);
        return slot;
    }

    /** Only slots requested through this WebSupportMemory are listed. */
    public synchronized List<SlotInfo> getUsedSlots() {
        List<SlotInfo> result = new ArrayList<>();
        slots.forEach((path, slot) -> result.add(new SlotInfo(path, slot.typeName())));
        return result;
    }

    /** Return the current value as text; null means an unknown slot. */
    public synchronized SlotValue getSlotValue(String path) throws CommunicationException {
        WebSlot<?> slot = slots.get(path);
        if (slot == null) return null;
        Object value = slot.raw.recall();
        String text;
        try { text = value == null ? null : String.valueOf(value); }
        catch (RuntimeException failure) {
            LOG.warn("Cannot render memory slot " + path, failure);
            text = "<unavailable>";
        }
        return new SlotValue(path, slot.typeName(), text);
    }

    @Override public void configure(IObjectConfigurator config) throws ConfigurationException {
        delegate.configure(config);
    }

    @Override public void cleanUp() throws IOException {
        synchronized (this) {
            if (closed) return;
            closed = true;
            slots.clear();
        }
        // Do not hold the memory monitor while stopping the server: an HTTP
        // handler may be waiting to acquire it.
        server.stop(0);
        delegate.cleanUp();
    }

    @Override public void close() throws IOException { cleanUp(); }

    private void ensureOpen() {
        if (closed) throw new IllegalStateException("WebSupportMemory has been closed");
    }

    private final class WebSlot<T> implements MemorySlot<T> {
        private final MemorySlot<T> raw;
        WebSlot(MemorySlot<T> raw) { this.raw = raw; }
        String typeName() { return raw.getDataType().getName(); }
        @Override public <S extends T> void memorize(S value) throws CommunicationException {
            synchronized (WebSupportMemory.this) { ensureOpen(); raw.memorize(value); }
        }
        @Override public void forget() throws CommunicationException {
            synchronized (WebSupportMemory.this) { ensureOpen(); raw.forget(); }
        }
        @Override public <S extends T> T recall() throws CommunicationException {
            synchronized (WebSupportMemory.this) { ensureOpen(); return raw.recall(); }
        }
        @Override public <S extends T> Class<S> getDataType() { return raw.getDataType(); }
        @Override public void configure(IObjectConfigurator config) throws ConfigurationException { raw.configure(config); }
        @Override public void cleanUp() throws IOException { raw.cleanUp(); }
    }

    private static boolean checkRequest(HttpExchange exchange, String expectedPath) throws IOException {
        if (!expectedPath.equals(exchange.getRequestURI().getPath())) {
            respond(exchange, 404, "{\"error\":\"Not found\"}");
            return false;
        }
        if (!"GET".equals(exchange.getRequestMethod())) {
            exchange.getResponseHeaders().set("Allow", "GET");
            respond(exchange, 405, "{\"error\":\"Method not allowed\"}");
            return false;
        }
        return true;
    }

    private static String queryParameter(String rawQuery, String name) {
        if (rawQuery == null) return null;
        for (String entry : rawQuery.split("&")) {
            String[] parts = entry.split("=", 2);
            if (URLDecoder.decode(parts[0], StandardCharsets.UTF_8).equals(name)) {
                return parts.length == 2 ? URLDecoder.decode(parts[1], StandardCharsets.UTF_8) : "";
            }
        }
        return null;
    }

    private static String jsonString(String value) {
        if (value == null) return "null";
        StringBuilder json = new StringBuilder("\"");
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '"' -> json.append("\\\"");
                case '\\' -> json.append("\\\\");
                case '\b' -> json.append("\\b");
                case '\f' -> json.append("\\f");
                case '\n' -> json.append("\\n");
                case '\r' -> json.append("\\r");
                case '\t' -> json.append("\\t");
                default -> {
                    if (c < 0x20) json.append(String.format("\\u%04x", (int)c));
                    else json.append(c);
                }
            }
        }
        return json.append('"').toString();
    }

    private static void respond(HttpExchange exchange, int status, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.getResponseHeaders().set("Cache-Control", "no-store");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream output = exchange.getResponseBody()) { output.write(bytes); }
    }

    private static void serverError(HttpExchange exchange, Exception error) {
        LOG.error("WebSupportMemory HTTP request failed", error);
        try { respond(exchange, 500, "{\"error\":\"Internal server error\"}"); }
        catch (IOException ignored) { }
    }
}
