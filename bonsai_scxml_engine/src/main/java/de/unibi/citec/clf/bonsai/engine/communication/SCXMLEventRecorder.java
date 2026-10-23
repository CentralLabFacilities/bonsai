package de.unibi.citec.clf.bonsai.engine.communication;

import com.fasterxml.jackson.databind.ObjectMapper;
import de.unibi.citec.clf.bonsai.engine.communication.SCXMLEventFactory.SCXMLEvent;
import org.apache.log4j.Logger;

import java.io.BufferedWriter;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Properties;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;

/**
 * Optional, process-wide JSONL recording of every event delivered by SCXMLEventBus.
 * The bus thread only performs a nonblocking queue offer; serialization and file
 * I/O are confined to a single daemon writer thread.
 */
public final class SCXMLEventRecorder implements Consumer<SCXMLEvent>, AutoCloseable {
    private static final Logger LOG = Logger.getLogger(SCXMLEventRecorder.class);
    private static final String CONFIG_RESOURCE = "/scxmlEventPublisher.properties";
    private static final String ENABLED_KEY = "bonsai.scxml.recorder.enabled";
    private static final String DIRECTORY_KEY = "bonsai.scxml.recorder.directory";
    private static final String CAPACITY_KEY = "bonsai.scxml.recorder.queue.capacity";
    private static final String SHUTDOWN_KEY = "bonsai.scxml.recorder.shutdown.timeout.ms";
    private static final int DEFAULT_CAPACITY = 10_000;
    private static final long DEFAULT_SHUTDOWN_MS = 5_000;
    private static final String DEFAULT_DIRECTORY = "logs/events";
    private static final DateTimeFormatter FILE_TIMESTAMP =
            DateTimeFormatter.ofPattern("yyyy-MM-dd_HH-mm-ss").withZone(ZoneOffset.UTC);

    private static boolean initializationAttempted;
    private static SCXMLEventRecorder instance;

    private final ArrayBlockingQueue<SCXMLEvent> queue;
    private final BufferedWriter writer;
    private final Thread worker;
    private final Path file;
    private final long shutdownTimeoutMs;
    private final ObjectMapper mapper = new ObjectMapper();
    private final AtomicBoolean accepting = new AtomicBoolean(true);
    private final AtomicBoolean failed = new AtomicBoolean(false);
    private final AtomicBoolean closeRequested = new AtomicBoolean(false);
    private final AtomicLong queueDropped = new AtomicLong();
    private volatile boolean terminated;
    private long reportedBusDropped;
    private long reportedQueueDropped;

    /** Starts at most one recorder per JVM session, if enabled in the shared properties resource. */
    public static synchronized void startIfEnabled() {
        if (initializationAttempted) return;
        initializationAttempted = true;
        try {
            Settings settings = readSettings();
            if (!settings.enabled()) return;
            SCXMLEventRecorder recorder = new SCXMLEventRecorder(settings);
            instance = recorder;
            SCXMLEventBus.addListener(recorder);
            LOG.info("SCXML event recording started: " + recorder.file);
        } catch (Exception failure) {
            LOG.error("Could not initialize SCXML event recording; execution will continue without recording", failure);
        }
    }

    /** Called by the event bus's single coordinated JVM shutdown hook. */
    static void stopIfStarted() {
        SCXMLEventRecorder current;
        synchronized (SCXMLEventRecorder.class) {
            current = instance;
        }
        if (current != null) current.close();
    }

    private SCXMLEventRecorder(Settings settings) throws IOException {
        this(settings.directory(), settings.capacity(), settings.shutdownTimeoutMs());
    }

    /** Package-private constructor for isolated recorder tests. */
    SCXMLEventRecorder(Path directory, int capacity, long shutdownTimeoutMs) throws IOException {
        queue = new ArrayBlockingQueue<>(capacity);
        this.shutdownTimeoutMs = shutdownTimeoutMs;
        Files.createDirectories(directory);
        BufferedWriter openedWriter = null;
        Path createdFile = null;
        String basename = "scxml-events-" + FILE_TIMESTAMP.format(Instant.now());
        for (int index = 0; index < 10_000; index++) {
            Path candidate = directory.resolve(basename + (index == 0 ? "" : "-" + index) + ".jsonl");
            try {
                openedWriter = Files.newBufferedWriter(candidate, StandardCharsets.UTF_8,
                        StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
                createdFile = candidate;
                break;
            } catch (java.nio.file.FileAlreadyExistsException collision) {
                // Another launch created a file in the same second; never overwrite it.
            }
        }
        if (openedWriter == null) throw new IOException("Could not create a unique SCXML recording file");
        file = createdFile;
        writer = openedWriter;
        worker = new Thread(this::writeLoop, "bonsai-scxml-recorder");
        worker.setDaemon(true);
        worker.start();
    }

    @Override
    public void accept(SCXMLEvent event) {
        if (accepting.get() && !queue.offer(event)) {
            queueDropped.incrementAndGet();
        }
    }

    private void writeLoop() {
        try {
            while (accepting.get() || !queue.isEmpty()) {
                SCXMLEvent event = queue.poll(100, TimeUnit.MILLISECONDS);
                if (event != null) writeEvent(event);
                reportLosses();
                if (event == null) writer.flush(); // Persist a quiet stream without waiting for JVM shutdown.
            }
            reportLosses(); // Includes losses occurring after the last delivered event.
            writer.flush();
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            LOG.error("SCXML event recording interrupted; recording may be incomplete");
        } catch (IOException | RuntimeException failure) {
            failed.set(true);
            accepting.set(false);
            SCXMLEventBus.removeListener(this);
            LOG.error("SCXML event recording failed; execution will continue without recording", failure);
        } finally {
            try {
                writer.close();
            } catch (IOException error) {
                failed.set(true);
                LOG.error("Failed to close SCXML event recording: " + file, error);
            }
            terminated = true;
        }
    }

    private void writeEvent(SCXMLEvent event) throws IOException {
        writer.write(SCXMLEventSerializer.serialize(event));
        writer.newLine();
    }

    private void reportLosses() throws IOException {
        long busDropped = SCXMLEventBus.getStatus().dropped();
        if (busDropped > reportedBusDropped) {
            writeLoss("event_bus", busDropped - reportedBusDropped);
            reportedBusDropped = busDropped;
        }
        long recorderDropped = queueDropped.get();
        if (recorderDropped > reportedQueueDropped) {
            writeLoss("recorder_queue", recorderDropped - reportedQueueDropped);
            reportedQueueDropped = recorderDropped;
        }
    }

    private void writeLoss(String source, long dropped) throws IOException {
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("recordKind", "recorder_metadata");
        metadata.put("type", "recording_loss");
        metadata.put("source", source);
        metadata.put("dropped", dropped);
        writeLine(metadata);
        LOG.warn("SCXML recording incomplete: " + dropped + " events lost at " + source);
    }

    private void writeLine(Map<String, Object> fields) throws IOException {
        writer.write(mapper.writeValueAsString(fields));
        writer.newLine();
    }

    /** Gracefully stop the writer. The event bus should be drained before this method runs. */
    @Override
    public void close() {
        if (!closeRequested.compareAndSet(false, true)) return;
        if (accepting.getAndSet(false)) SCXMLEventBus.removeListener(this);
        if (Thread.currentThread() == worker) return;
        try {
            worker.join(Math.max(1L, shutdownTimeoutMs));
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
        }
        if (!terminated) {
            LOG.error("SCXML recorder shutdown timed out; " + queue.size()
                    + " queued events and the current write may be incomplete: " + file);
            worker.interrupt();
        } else if (!failed.get()) {
            LOG.info("SCXML event recording closed: " + file);
        }
    }

    private static Settings readSettings() {
        Properties p = new Properties();
        try (InputStream stream = SCXMLEventRecorder.class.getResourceAsStream(CONFIG_RESOURCE)) {
            if (stream != null) p.load(stream);
            else LOG.warn("SCXML recorder configuration not found; recording disabled: " + CONFIG_RESOURCE);
        } catch (IOException error) {
            LOG.error("Unable to read SCXML recorder configuration; recording disabled", error);
            return new Settings(false, Path.of(DEFAULT_DIRECTORY), DEFAULT_CAPACITY, DEFAULT_SHUTDOWN_MS);
        }
        boolean enabled = Boolean.parseBoolean(p.getProperty(ENABLED_KEY, "false").trim());
        String directory = p.getProperty(DIRECTORY_KEY, DEFAULT_DIRECTORY).trim();
        if (directory.isEmpty()) directory = DEFAULT_DIRECTORY;
        return new Settings(enabled, Path.of(directory),
                positiveInt(p, CAPACITY_KEY, DEFAULT_CAPACITY),
                positiveLong(p, SHUTDOWN_KEY, DEFAULT_SHUTDOWN_MS));
    }

    private static int positiveInt(Properties p, String key, int fallback) {
        try {
            int value = Integer.parseInt(p.getProperty(key, Integer.toString(fallback)).trim());
            if (value > 0) return value;
        } catch (NumberFormatException ignored) { }
        LOG.warn("Invalid " + key + "; using " + fallback);
        return fallback;
    }

    private static long positiveLong(Properties p, String key, long fallback) {
        try {
            long value = Long.parseLong(p.getProperty(key, Long.toString(fallback)).trim());
            if (value > 0) return value;
        } catch (NumberFormatException ignored) { }
        LOG.warn("Invalid " + key + "; using " + fallback);
        return fallback;
    }

    private record Settings(boolean enabled, Path directory, int capacity, long shutdownTimeoutMs) { }
}
