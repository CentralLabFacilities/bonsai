package de.unibi.citec.clf.bonsai.monitoring.logging;

import de.unibi.citec.clf.bonsai.monitoring.events.BonsaiEventBus;
import org.apache.log4j.AppenderSkeleton;
import org.apache.log4j.spi.LoggingEvent;

import java.time.Instant;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;

public class RuntimeLogAppender extends AppenderSkeleton {

    private static final int CAPACITY = 4096;

    private final BlockingQueue<RuntimeLog> queue =
            new ArrayBlockingQueue<>(CAPACITY);

    private final ThreadLocal<Boolean> publishing =
            ThreadLocal.withInitial(() -> false);

    private final Thread dispatcher;

    private volatile boolean stopped = false;

    public RuntimeLogAppender() {
        dispatcher = new Thread(
                this::dispatch,
                "bonsai-runtime-logs"
        );

        dispatcher.setDaemon(true);
        dispatcher.start();
    }

    @Override
    protected void append(LoggingEvent event) {
        if (stopped || publishing.get()) {
            return;
        }

        String[] trace = event.getThrowableStrRep();

        RuntimeLog log = new RuntimeLog(
                event.getTimeStamp(),
                event.getLevel().toString(),
                event.getLoggerName(),
                event.getThreadName(),
                event.getRenderedMessage(),
                trace == null ? null : String.join("\n", trace)
        );

        queue.offer(log);
    }

    private void dispatch() {
        try {
            while (!stopped) {
                RuntimeLog log = queue.take();

                publishing.set(true);

                try {
                    RuntimeLogBus.publish(log);
                } finally {
                    publishing.remove();
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    @Override
    public void close() {
        stopped = true;
        closed = true;
        dispatcher.interrupt();
    }

    @Override
    public boolean requiresLayout() {
        return false;
    }
}