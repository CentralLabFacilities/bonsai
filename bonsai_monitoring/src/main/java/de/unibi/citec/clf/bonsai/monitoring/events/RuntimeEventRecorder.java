package de.unibi.citec.clf.bonsai.monitoring.events;

import org.apache.log4j.Logger;

import java.io.BufferedWriter;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.Objects;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/**
 * Optional JSONL recorder for events published on {@link BonsaiEventBus}.
 * Subscribes to the {@link BonsaiEventBus} and records incoming events.
 *
 * <p>Recording starts only when {@link #start(Path)} is called. Events are queued
 * without disk I/O on the publisher's thread, then written in queue arrival
 * order by a single writer thread. {@link #stop()} drains the queue, flushes,
 * and closes the recording before returning.</p>
 *
 * <p>The queue is bounded to protect robot execution. A full queue or a writer
 * error stops recording, is logged, and is exposed by {@link #getFailure()}.
 * No event is silently discarded while reporting successful recording.</p>
 */
public final class RuntimeEventRecorder implements Consumer<BonsaiEvent>, AutoCloseable {
    private static final Logger LOG = Logger.getLogger(RuntimeEventRecorder.class);
    private static final int DEFAULT_CAPACITY = 8192;
    // Make events visible to log followers while the process is still running.
    private static final long FLUSH_INTERVAL_NANOS = TimeUnit.MILLISECONDS.toNanos(100);

    private final Object lock = new Object();
    private final BlockingQueue<BonsaiEvent> queue;
    private volatile boolean recording;
    private volatile IOException failure;
    private Thread writerThread;

    public RuntimeEventRecorder() {
        this(DEFAULT_CAPACITY);
    }

    /** @param queueCapacity maximum number of events awaiting disk writing */
    public RuntimeEventRecorder(int queueCapacity) {
        if (queueCapacity <= 0) {
            throw new IllegalArgumentException("queueCapacity must be positive");
        }
        queue = new ArrayBlockingQueue<>(queueCapacity);
    }

    /**
     * Start a new recording. An existing file is never overwritten. Call
     * {@link #stop()} before starting another recording with this instance.
     *
     * @param file destination .jsonl file
     * @throws IOException if the file cannot be opened
     * @throws IllegalStateException if a recording is already active or stopping
     */
    public void start(Path file) throws IOException {
        synchronized (lock) {
            if (writerThread != null) {
                throw new IllegalStateException("Stop the previous recording before starting another");
            }
            Path absolute = Objects.requireNonNull(file, "file").toAbsolutePath();
            Path parent = absolute.getParent();
            if (parent != null) {
                Files.createDirectories(parent);
            }
            BufferedWriter output = Files.newBufferedWriter(
                    absolute, StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE);
            queue.clear();
            failure = null;
            recording = true;
            writerThread = new Thread(() -> writeEvents(output), "bonsai-event-recorder");
            writerThread.setDaemon(true);
            writerThread.start();
            BonsaiEventBus.subscribe(this);
        }
    }

    /**
     * Enqueue the event without blocking for disk I/O. Called by the event bus.
     * If the queue fills, recording fails explicitly rather than silently
     * dropping event records.
     */
    @Override
    public void accept(BonsaiEvent event) {
        synchronized (lock) {
            if (!recording) {
                return;
            }
            if (!queue.offer(Objects.requireNonNull(event, "event"))) {
                fail(new IOException("Event recording queue is full; recording is incomplete"));
            }
        }
    }

    private void writeEvents(BufferedWriter output) {
        try (BufferedWriter writer = output) {
            boolean hasUnflushedEvents = false;
            long lastFlush = System.nanoTime();
            while (recording || !queue.isEmpty()) {
                BonsaiEvent event = queue.poll(100, TimeUnit.MILLISECONDS);
                if (event != null) {
                    writer.write(BonsaiEventSerializer.toJson(event));
                    writer.newLine();
                    hasUnflushedEvents = true;
                }

                // Flush at the end of a burst, on an idle poll, or at least
                // every 100 ms during sustained traffic. Disk I/O remains on
                // this writer thread, never on the SCXML execution thread.
                if (hasUnflushedEvents && (event == null || queue.isEmpty()
                        || System.nanoTime() - lastFlush >= FLUSH_INTERVAL_NANOS)) {
                    writer.flush();
                    hasUnflushedEvents = false;
                    lastFlush = System.nanoTime();
                }
            }
            writer.flush();
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            fail(new IOException("Event recording interrupted", interrupted));
        } catch (IOException | RuntimeException error) {
            fail(new IOException("Unable to write Bonsai event recording", error));
        } finally {
            recording = false;
            BonsaiEventBus.unsubscribe(this);
        }
    }

    private void fail(IOException cause) {
        // The earliest failure is the most useful diagnosis.
        if (failure == null) {
            failure = cause;
            LOG.error("Bonsai event recording stopped", cause);
        }
        recording = false;
        BonsaiEventBus.unsubscribe(this);
    }

    /**
     * Stop accepting events and wait until all queued events are written.
     *
     * @throws IOException if writing failed or the stop was interrupted
     */
    public void stop() throws IOException {
        Thread toJoin;
        synchronized (lock) {
            recording = false;
            BonsaiEventBus.unsubscribe(this);
            toJoin = writerThread;
        }
        if (toJoin != null) {
            if (toJoin == Thread.currentThread()) {
                throw new IllegalStateException("Recorder cannot stop from its own writer thread");
            }
            try {
                toJoin.join();
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                throw new IOException("Interrupted while closing the event recording", interrupted);
            }
            synchronized (lock) {
                if (writerThread == toJoin) {
                    writerThread = null;
                }
            }
        }
        if (failure != null) {
            throw failure;
        }
    }

    /** Whether new events are currently being accepted for recording. */
    public boolean isRecording() {
        return recording;
    }

    /** The first recording failure, or {@code null} if none occurred. */
    public IOException getFailure() {
        return failure;
    }

    @Override
    public void close() throws IOException {
        stop();
    }
}
