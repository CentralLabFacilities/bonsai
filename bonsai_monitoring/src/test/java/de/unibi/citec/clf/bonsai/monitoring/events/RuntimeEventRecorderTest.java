package de.unibi.citec.clf.bonsai.monitoring.events;

import de.unibi.citec.clf.bonsai.monitoring.events.slots.SlotEvents;
import org.junit.Test;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.Assert.*;

public class RuntimeEventRecorderTest {

    @Test
    public void recordsOnlyBetweenStartAndStopAndSupportsRestart() throws Exception {
        Path directory = Files.createTempDirectory("bonsai-recorder-test");
        Path first = directory.resolve("run-1.jsonl");
        Path second = directory.resolve("run-2.jsonl");
        RuntimeEventRecorder recorder = new RuntimeEventRecorder();
        try {
            BonsaiEventBus.publish(SlotEvents.cleared("before", "String"));
            recorder.start(first);
            assertTrue(recorder.isRecording());
            BonsaiEventBus.publish(SlotEvents.written("x", "String", "hello"));
            BonsaiEventBus.publish(SlotEvents.cleared("x", "String"));
            recorder.stop();
            assertFalse(recorder.isRecording());
            BonsaiEventBus.publish(SlotEvents.cleared("after", "String"));
            List<String> firstLines = Files.readAllLines(first, StandardCharsets.UTF_8);
            assertEquals(2, firstLines.size());
            assertTrue(firstLines.get(0).contains("\"type\":\"slot_written\""));
            assertTrue(firstLines.get(0).contains("\"value\":\"hello\""));
            assertTrue(firstLines.get(1).contains("\"type\":\"slot_cleared\""));

            recorder.start(second);
            BonsaiEventBus.publish(SlotEvents.written("y", "String", "new run"));
            recorder.stop();
            assertEquals(1, Files.readAllLines(second, StandardCharsets.UTF_8).size());
        } finally {
            recorder.close();
        }
    }

    @Test
    public void publishedEventsAreVisibleWhileRecordingIsStillRunning() throws Exception {
        Path file = Files.createTempDirectory("bonsai-recorder-live").resolve("run.jsonl");
        try (RuntimeEventRecorder recorder = new RuntimeEventRecorder()) {
            recorder.start(file);
            BonsaiEventBus.publish(SlotEvents.written("live", "String", "visible"));

            // A writer that flushes only in stop() will fail this test.
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            String contents = "";
            while (System.nanoTime() < deadline) {
                contents = Files.readString(file);
                if (contents.contains("\"type\":\"slot_written\"")) {
                    break;
                }
                Thread.sleep(10);
            }
            assertTrue("The JSONL must become readable before stop()", contents.contains("\"type\":\"slot_written\""));
            assertTrue("Recorder must still be running", recorder.isRecording());
            assertNull(recorder.getFailure());
        }
    }

    @Test
    public void drainingOnStopPreservesAllConcurrentPublishedEvents() throws Exception {
        Path file = Files.createTempDirectory("bonsai-recorder-concurrent").resolve("run.jsonl");
        RuntimeEventRecorder recorder = new RuntimeEventRecorder(4096);
        ExecutorService executor = Executors.newFixedThreadPool(4);
        CountDownLatch start = new CountDownLatch(1);
        try {
            recorder.start(file);
            for (int thread = 0; thread < 4; thread++) {
                final int producer = thread;
                executor.submit(() -> {
                    try {
                        start.await();
                        for (int i = 0; i < 100; i++) {
                            BonsaiEventBus.publish(SlotEvents.written(
                                    "slot-" + producer + "-" + i, "String", String.valueOf(i)));
                        }
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                });
            }
            start.countDown();
            executor.shutdown();
            assertTrue(executor.awaitTermination(15, TimeUnit.SECONDS));
            recorder.stop();
            assertNull(recorder.getFailure());
            assertEquals(400, Files.readAllLines(file, StandardCharsets.UTF_8).size());
        } finally {
            executor.shutdownNow();
            recorder.close();
        }
    }

    @Test
    public void existingFileIsNeverOverwritten() throws Exception {
        Path file = Files.createTempFile("bonsai-recorder-existing", ".jsonl");
        Files.writeString(file, "original");
        try (RuntimeEventRecorder recorder = new RuntimeEventRecorder()) {
            try {
                recorder.start(file);
                fail("Expected an IOException when recording to an existing file");
            } catch (java.nio.file.FileAlreadyExistsException expected) {
                assertFalse(recorder.isRecording());
                assertEquals("original", Files.readString(file));
            }
        }
    }
}
