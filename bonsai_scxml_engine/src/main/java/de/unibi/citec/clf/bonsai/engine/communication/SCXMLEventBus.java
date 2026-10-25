package de.unibi.citec.clf.bonsai.engine.communication;

import de.unibi.citec.clf.bonsai.engine.communication.SCXMLEventFactory.SCXMLEvent;
import org.apache.log4j.Logger;

import java.io.IOException;
import java.io.InputStream;
import java.util.Objects;
import java.util.Properties;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;

/**
 * Process-wide, asynchronous delivery of Bonsai SCXML notifications.
 * Producers never wait for a subscriber or for queue capacity. The single
 * worker delivers accepted events in sequence order to each registered listener.
 * A full queue is an explicitly reported loss, not a silent history gap.
 */
public final class SCXMLEventBus {
    private static final Logger LOG = Logger.getLogger(SCXMLEventBus.class);
    private static final String CONFIG_RESOURCE = "/scxmlEventPublisher.properties";
    private static final String CAPACITY_KEY = "bonsai.scxml.events.queue.capacity";
    private static final String SHUTDOWN_KEY = "bonsai.scxml.events.shutdown.timeout.ms";
    private static final int DEFAULT_CAPACITY = 10_000;
    private static final long DEFAULT_SHUTDOWN_MS = 2_000L;

    private static final PublisherSettings SETTINGS = loadSettings();
    private static final Dispatcher DISPATCHER = new Dispatcher(
            SETTINGS.queueCapacity(), "bonsai-scxml-events");

    static {
        SCXMLEventRecorder.startIfEnabled();
        Runtime.getRuntime().addShutdownHook(new Thread(SCXMLEventBus::shutdown, "bonsai-scxml-events-shutdown"));
    }

    private SCXMLEventBus() { }

    public static void addListener(Consumer<SCXMLEvent> listener) {
        DISPATCHER.addListener(listener);
    }

    public static void removeListener(Consumer<SCXMLEvent> listener) {
        DISPATCHER.removeListener(listener);
    }

    /** Nonblocking publisher function. */
    public static void publish(SCXMLEvent event) {
        DISPATCHER.publish(event);
    }

    public static PublisherStatus getStatus() {
        return DISPATCHER.status();
    }

    /** Called during JVM shutdown */
    public static void shutdown() {
        DISPATCHER.shutdown(SETTINGS.shutdownTimeoutMs());
        SCXMLEventRecorder.stopIfStarted();
    }

    public record PublisherStatus(long accepted, long delivered, long dropped,
                                  long subscriberFailures, int queued, boolean delivering,
                                  boolean incomplete, boolean accepting,
                                  boolean terminated) { }

    private static PublisherSettings loadSettings() {
        try (InputStream input = SCXMLEventBus.class.getResourceAsStream(CONFIG_RESOURCE)) {
            if (input == null) {
                LOG.warn("SCXML event publisher configuration not found: " + CONFIG_RESOURCE + "; using defaults");
                return readSettings(null);
            }
            return readSettings(input);
        } catch (IOException error) {
            LOG.warn("Could not close SCXML event publisher configuration; using defaults", error);
            return new PublisherSettings(DEFAULT_CAPACITY, DEFAULT_SHUTDOWN_MS);
        }
    }

    /** Package-private for configuration tests. */
    static PublisherSettings readSettings(InputStream input) {
        Properties properties = new Properties();
        if (input != null) {
            try {
                properties.load(input);
            } catch (IOException error) {
                LOG.warn("Could not read " + CONFIG_RESOURCE + "; using defaults", error);
                return new PublisherSettings(DEFAULT_CAPACITY, DEFAULT_SHUTDOWN_MS);
            }
        }
        return new PublisherSettings(
                positiveInt(properties),
                positiveLong(properties));
    }

    record PublisherSettings(int queueCapacity, long shutdownTimeoutMs) { }

    private static int positiveInt(Properties properties) {
        String configured = properties.getProperty(SCXMLEventBus.CAPACITY_KEY);
        if (configured == null) return SCXMLEventBus.DEFAULT_CAPACITY;
        try {
            int value = Integer.parseInt(configured.trim());
            if (value > 0) return value;
        } catch (NumberFormatException ignored) { }
        LOG.warn("Invalid " + SCXMLEventBus.CAPACITY_KEY + " in " + CONFIG_RESOURCE + "; using " + SCXMLEventBus.DEFAULT_CAPACITY);
        return SCXMLEventBus.DEFAULT_CAPACITY;
    }

    private static long positiveLong(Properties properties) {
        String configured = properties.getProperty(SCXMLEventBus.SHUTDOWN_KEY);
        if (configured == null) return SCXMLEventBus.DEFAULT_SHUTDOWN_MS;
        try {
            long value = Long.parseLong(configured.trim());
            if (value > 0) return value;
        } catch (NumberFormatException ignored) { }
        LOG.warn("Invalid " + SCXMLEventBus.SHUTDOWN_KEY + " in " + CONFIG_RESOURCE + "; using " + SCXMLEventBus.DEFAULT_SHUTDOWN_MS);
        return SCXMLEventBus.DEFAULT_SHUTDOWN_MS;
    }

    /** Package-private so concurrency tests can use isolated queues. */
    static final class Dispatcher {
        private final ArrayBlockingQueue<SCXMLEvent> queue;
        private final CopyOnWriteArrayList<Consumer<SCXMLEvent>> listeners =
                new CopyOnWriteArrayList<>();
        private final Thread worker;
        private final Object submissionLock = new Object();
        private volatile boolean accepting = true;
        private volatile boolean delivering;
        private volatile boolean terminated;
        private volatile boolean incomplete;
        private long accepted;
        private long delivered;
        private long dropped;
        private long subscriberFailures;

        Dispatcher(int capacity, String threadName) {
            if (capacity <= 0) throw new IllegalArgumentException("capacity must be positive");
            queue = new ArrayBlockingQueue<>(capacity);
            worker = new Thread(this::deliverLoop, threadName);
            // A stuck consumer must not prevent the JVM from exiting after shutdown timeout.
            worker.setDaemon(true);
            worker.start();
        }

        void addListener(Consumer<SCXMLEvent> listener) {
            listeners.addIfAbsent(Objects.requireNonNull(listener, "listener"));
        }

        void removeListener(Consumer<SCXMLEvent> listener) {
            listeners.remove(listener);
        }

        void publish(SCXMLEvent event) {
            Objects.requireNonNull(event, "event");
            long lossCount = 0;
            synchronized (submissionLock) {
                if (accepting && queue.offer(event.withSequence(accepted + 1))) {
                    accepted++;
                    return;
                }
                incomplete = true;
                lossCount = ++dropped;
            }
            // Log without the submission lock, throttled to powers of two.
            if (lossCount == 1 || (lossCount & (lossCount - 1)) == 0) {
                LOG.error("SCXML event notification incomplete: " + lossCount
                        + " events rejected (queue full or publisher shut down)");
            }
        }

        PublisherStatus status() {
            synchronized (submissionLock) {
                return new PublisherStatus(accepted, delivered, dropped, subscriberFailures, queue.size(),
                        delivering, incomplete, accepting, terminated);
            }
        }

        private void deliverLoop() {
            try {
                while (accepting || !queue.isEmpty()) {
                    SCXMLEvent event;
                    try {
                        event = queue.poll(100, TimeUnit.MILLISECONDS);
                    } catch (InterruptedException interrupted) {
                        if (!accepting) break;
                        continue;
                    }
                    if (event == null) continue;
                    synchronized (submissionLock) { delivering = true; }
                    try {
                        for (Consumer<SCXMLEvent> listener : listeners) {
                            try {
                                listener.accept(event);
                            } catch (RuntimeException error) {
                                synchronized (submissionLock) {
                                    subscriberFailures++;
                                    incomplete = true;
                                }
                                LOG.error("SCXML event subscriber failed for sequence "
                                        + event.sequence(), error);
                            }
                        }
                    } finally {
                        synchronized (submissionLock) {
                            delivering = false;
                            delivered++;
                        }
                    }
                }
            } finally {
                synchronized (submissionLock) { terminated = true; }
            }
        }

        void shutdown(long timeoutMillis) {
            synchronized (submissionLock) { accepting = false; }
            if (Thread.currentThread() == worker) return;
            try {
                worker.join(Math.max(1L, timeoutMillis));
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            }
            if (worker.isAlive()) {
                int pending;
                synchronized (submissionLock) {
                    incomplete = true;
                    pending = queue.size() + (delivering ? 1 : 0);
                }
                LOG.error("SCXML event publisher shutdown timed out; " + pending
                        + " events may remain undelivered");
                worker.interrupt();
            }
        }
    }
}
