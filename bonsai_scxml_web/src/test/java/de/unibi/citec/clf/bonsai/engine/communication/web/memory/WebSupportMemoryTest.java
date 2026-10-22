package de.unibi.citec.clf.bonsai.engine.communication.web.memory;

import de.unibi.citec.clf.bonsai.memory.DefaultMemory;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import org.junit.Test;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;

public class WebSupportMemoryTest {
    private static final HttpClient HTTP = HttpClient.newHttpClient();

    private HttpResponse<String> request(WebSupportMemory memory, String method, String path) throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("http://127.0.0.1:" + memory.getPort() + path))
                .method(method, HttpRequest.BodyPublishers.noBody()).build();
        return HTTP.send(request, HttpResponse.BodyHandlers.ofString());
    }
    private HttpResponse<String> get(WebSupportMemory memory, String path) throws Exception {
        return request(memory, "GET", path);
    }

    @Test public void listsRequestedSlotsAndCurrentValues() throws Exception {
        try (WebSupportMemory memory = new WebSupportMemory(new DefaultMemory(), 0)) {
            assertEquals("[]", get(memory, "/getUsedSlots").body());
            MemorySlot<String> slot = memory.getSlot("/navigation/target", String.class);
            assertEquals("[{\"path\":\"/navigation/target\",\"type\":\"java.lang.String\"}]",
                    get(memory, "/getUsedSlots").body());
            String path = "/getSlot?path=" + URLEncoder.encode("/navigation/target", StandardCharsets.UTF_8);
            assertEquals("{\"path\":\"/navigation/target\",\"type\":\"java.lang.String\",\"value\":null}", get(memory, path).body());
            slot.memorize("kitchen");
            assertEquals("{\"path\":\"/navigation/target\",\"type\":\"java.lang.String\",\"value\":\"kitchen\"}", get(memory, path).body());
            slot.memorize("living\"room\n");
            assertTrue(get(memory, path).body().contains("living\\\"room\\n"));
            assertSame(slot, memory.getSlot("/navigation/target", String.class));
            assertEquals(1, memory.getUsedSlots().size());
            slot.forget();
            assertTrue(get(memory, path).body().contains("\"value\":null"));
        }
    }

    @Test public void distinguishesUnknownSlotsAndRejectsWrites() throws Exception {
        try (WebSupportMemory memory = new WebSupportMemory(new DefaultMemory(), 0)) {
            assertEquals(404, get(memory, "/getSlot?path=%2Fmissing").statusCode());
            assertEquals(400, get(memory, "/getSlot").statusCode());
            assertEquals(405, request(memory, "POST", "/getSlot?path=%2Fmissing").statusCode());
            assertEquals(404, get(memory, "/getSlot/other").statusCode());
        }
    }

    @Test public void cleanUpReleasesPort() throws Exception {
        WebSupportMemory memory = new WebSupportMemory(new DefaultMemory(), 0);
        int port = memory.getPort();
        memory.close();
        memory.close();
        assertThrows(IllegalStateException.class, () -> memory.getSlot("/target", String.class));
        try (WebSupportMemory reopened = new WebSupportMemory(new DefaultMemory(), port)) {
            assertEquals(200, get(reopened, "/getUsedSlots").statusCode());
        }
    }
}
