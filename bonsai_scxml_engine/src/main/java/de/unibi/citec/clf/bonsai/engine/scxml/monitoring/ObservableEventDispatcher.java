package de.unibi.citec.clf.bonsai.engine.scxml.monitoring;

import org.apache.commons.scxml2.EventDispatcher;
import org.apache.commons.scxml2.SCXMLIOProcessor;
import org.jetbrains.annotations.NotNull;

import java.util.Map;


/**
 * Observes SCXML send requests after forwarding them to the original event
 * dispatcher. No action wrapping or thread-local origin tracking is required.
 * Does not alter event routing, cancellation or delayed scheduling.
 * A notification means the request was handled by the dispatcher, not that a
 * delayed event has already reached its destination.
 */
public final class ObservableEventDispatcher implements EventDispatcher {
    @FunctionalInterface
    public interface SendObserver {
        void onSend(String id, String target, String targetType,
                    String event, Object data, long delayMillis);
    }

    private final EventDispatcher delegate;
    private final SendObserver observer;

    public ObservableEventDispatcher(@NotNull EventDispatcher delegate, @NotNull SendObserver observer) {
        this.delegate = delegate;
        this.observer = observer;
    }

    @Override
    public void send(Map<String, SCXMLIOProcessor> ioProcessors, String id, String target,
                     String type, String event, Object data, Object hints, long delay) {
        delegate.send(ioProcessors, id, target, type, event, data, hints, delay);
        try {
            observer.onSend(id, target, type, event, data, delay);
        } catch (RuntimeException ignored) {
            // Monitoring failures must not affect event dispatch.
        }
    }

    /**
     * Creates an independent dispatcher for an invoked SCXML machine while
     * retaining the same observer. The delegate manages its own delayed sends
     * and cancellations.
     */
    @Override
    public EventDispatcher newInstance() {
        return new ObservableEventDispatcher(delegate.newInstance(), observer);
    }

    @Override
    public void cancel(String sendId) {
        delegate.cancel(sendId);
    }
}
