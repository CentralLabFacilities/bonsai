package de.unibi.citec.clf.bonsai.memory;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import de.unibi.citec.clf.bonsai.core.configuration.IObjectConfigurator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException;
import de.unibi.citec.clf.bonsai.core.exception.CoreObjectCreationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.WorkingMemory;
import de.unibi.citec.clf.bonsai.memory.slots.WebSlot;
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
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/** Working memory that owns ObjectSlots and exposes reads and write notifications over HTTP. */
public final class WebSupportMemory implements WorkingMemory, AutoCloseable {
    public record SlotInfo(String path, String type) { }
    public record SlotValue(String path, String type, String value) { }

    private static final Logger LOG = Logger.getLogger(WebSupportMemory.class);
    private static final String RESYNC = "event: resync_required\ndata: {}\n\n";

    private final Map<String, WebSlot<?>> slots = new LinkedHashMap<>();
    private final CopyOnWriteArrayList<Client> clients = new CopyOnWriteArrayList<>();

    private HttpServer server;
    private ExecutorService httpThreads;
    private boolean parametersDeclared;

    private static final class Client {
        final ArrayBlockingQueue<String> messages = new ArrayBlockingQueue<>(256);
    }

    // Bonsai configures each memory twice: first to declare its options,
    // then to apply the resolved values. Only the second pass starts HTTP.
    @Override
    public synchronized void configure(IObjectConfigurator conf) throws ConfigurationException {
        // Bonsai may revisit configuration on an already initialized memory.
        // Keep its slots and active SSE clients; never restart the HTTP server.
        if (server != null) return;

        String requestedPort = conf.requestOptionalValue("port", "8081");
        if (!parametersDeclared) {
            parametersDeclared = true;
            return;
        }
        final int port;
        try {
            port = Integer.parseInt(requestedPort);
            if (port < 0 || port > 65535) throw new NumberFormatException("Out of range");
        } catch (NumberFormatException failure) {
            throw new ConfigurationException("Invalid WebSupportMemory port: " + requestedPort);
        }
        try {
            HttpServer newServer = HttpServer.create(
                    new InetSocketAddress(InetAddress.getByName("127.0.0.1"), port), 0);
            newServer.createContext("/getUsedSlots", this::handleUsedSlots);
            newServer.createContext("/getSlot", this::handleGetSlot);
            newServer.createContext("/events", this::handleEvents);

            httpThreads = Executors.newCachedThreadPool(task -> {
                Thread t = new Thread(task, "bonsai-memory-http");
                t.setDaemon(true);
                return t;
            });
            newServer.setExecutor(httpThreads);
            newServer.start();
            server = newServer;
            LOG.info("WebSupportMemory listening on http://127.0.0.1:" + getPort());
        } catch (IOException failure) {
            if (httpThreads != null) httpThreads.shutdownNow();
            throw new CoreObjectCreationException("Could not start WebSupportMemory HTTP server", failure);
        }
    }

    public int getPort() { return server == null ? -1 : server.getAddress().getPort(); }

    @Override
    @SuppressWarnings("unchecked")
    public synchronized <T> MemorySlot<T> getSlot(String path, Class<T> dataType)
            throws CommunicationException, CoreObjectCreationException {
        WebSlot<?> slot = slots.get(path);
        if (slot != null) {
            if (!slot.getDataType().equals(dataType)) {
                throw new IllegalArgumentException("Slot '" + path + "' already has type "
                        + slot.getDataType().getName() + ", requested " + dataType.getName());
            }
            return (MemorySlot<T>) slot;
        }
        WebSlot<T> created = new WebSlot<>(path, dataType, this::notifyWrite);
        slots.put(path, created);
        return created;
    }

    public synchronized List<SlotInfo> getUsedSlots() {
        List<SlotInfo> result = new ArrayList<>();
        slots.forEach((path, slot) -> result.add(new SlotInfo(path, slot.getDataType().getName())));
        return result;
    }

    public synchronized SlotValue getSlotValue(String path) throws CommunicationException {
        WebSlot<?> slot = slots.get(path);
        if (slot == null) return null;
        Object value = slot.recall();
        String text;
        try { text = value == null ? null : String.valueOf(value); }
        catch (RuntimeException failure) {
            LOG.warn("Cannot display memory slot " + path, failure);
            text = "<unavailable>";
        }
        return new SlotValue(path, slot.getDataType().getName(), text);
    }

    // Capture the written value on the skill's thread, then enqueue without network I/O.
    private void notifyWrite(String path, Object value) {
        // Capture the value now, not by recalling the slot later (it may already have changed).
        // Like /getSlot, this exposes the object's textual representation, not an object graph.
        String text;
        try {
            text = value == null ? null : String.valueOf(value);
        } catch (RuntimeException failure) {
            LOG.warn("Cannot display written memory slot " + path, failure);
            text = "<unavailable>";
        }
        String event = "event: slot_written\ndata: {\"path\":" + jsonString(path)
                + ",\"value\":" + jsonString(text) + "}\n\n";
        for (Client client : clients) {
            if (!client.messages.offer(event)) {
                // A slow subscriber cannot silently miss writes: tell it to resync and reconnect.
                clients.remove(client);
                client.messages.clear();
                client.messages.offer(RESYNC);
            }
        }
    }

    private void handleEvents(HttpExchange exchange) throws IOException {
        if (!checkRequest(exchange, "/events")) return;
        exchange.getResponseHeaders().set("Content-Type", "text/event-stream; charset=utf-8");
        exchange.getResponseHeaders().set("Cache-Control", "no-cache");
        Client client = new Client();
        clients.add(client);
        try {
            exchange.sendResponseHeaders(200, 0);
            try (OutputStream out = exchange.getResponseBody()) {
                writeSse(out, ": connected\n\n");
                while (!Thread.currentThread().isInterrupted()) {
                    String message = client.messages.poll(20, TimeUnit.SECONDS);
                    if (message == null) message = ": keepalive\n\n";
                    writeSse(out, message);
                    if (RESYNC.equals(message)) break;
                }
            }
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        } catch (IOException disconnect) {
            LOG.debug("Memory SSE client disconnected", disconnect);
        } finally {
            clients.remove(client);
            exchange.close();
        }
    }

    private static void writeSse(OutputStream out, String message) throws IOException {
        out.write(message.getBytes(StandardCharsets.UTF_8));
        out.flush();
    }

    private void handleUsedSlots(HttpExchange exchange) throws IOException {
        if (!checkRequest(exchange, "/getUsedSlots")) return;
        try {
            StringBuilder json = new StringBuilder("[");
            for (SlotInfo slot : getUsedSlots()) {
                if (json.length() > 1) json.append(',');
                json.append("{\"path\":").append(jsonString(slot.path()))
                        .append(",\"type\":").append(jsonString(slot.type())).append('}');
            }
            respond(exchange, 200, json.append(']').toString());
        } catch (RuntimeException failure) { serverError(exchange, failure); }
    }

    private void handleGetSlot(HttpExchange exchange) throws IOException {
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
        } catch (CommunicationException | RuntimeException failure) { serverError(exchange, failure); }
    }

    @Override
    public void cleanUp() throws IOException {
        // Avoid holding a lock while stopping the server (handlers may be waiting for it).
        HttpServer toStop;
        ExecutorService toShutdown;
        synchronized (this) {
            toStop = server;
            server = null;
            toShutdown = httpThreads;
            httpThreads = null;
        }
        if (toStop != null) toStop.stop(0);
        if (toShutdown != null) toShutdown.shutdownNow();
        clients.clear();
        synchronized (this) {
            for (WebSlot<?> slot : slots.values()) slot.cleanUp();
            slots.clear();
        }
    }

    @Override public void close() throws IOException { cleanUp(); }

    private static boolean checkRequest(HttpExchange exchange, String path) throws IOException {
        if (!path.equals(exchange.getRequestURI().getPath())) {
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
            if (URLDecoder.decode(parts[0], StandardCharsets.UTF_8).equals(name))
                return parts.length == 2 ? URLDecoder.decode(parts[1], StandardCharsets.UTF_8) : "";
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
        try (OutputStream out = exchange.getResponseBody()) { out.write(bytes); }
    }

    private static void serverError(HttpExchange exchange, Exception failure) {
        LOG.error("WebSupportMemory HTTP request failed", failure);
        try { respond(exchange, 500, "{\"error\":\"Internal server error\"}"); }
        catch (IOException ignored) { }
    }
}
