package de.unibi.citec.clf.bonsai.engine.communication;

import de.unibi.citec.clf.bonsai.engine.communication.SCXMLEventFactory.SCXMLEvent;
import org.apache.log4j.Logger;

import java.util.function.Consumer;

/** Translates SCXML runtime notifications into external transition and status publications. */
public abstract class RuntimePublisher implements Consumer<SCXMLEvent> {
    private static final Logger LOG = Logger.getLogger(RuntimePublisher.class);

    @Override
    public void accept(SCXMLEvent change) {
        var fields = change.details();
        switch (change.type()) {
            case "status" -> {
                String value = fields.get("value");
                if (value != null) {
                    try {
                        publishStatus(StatemachineStatus.valueOf(value));
                    } catch (IllegalArgumentException invalid) {
                        LOG.warn("Ignoring unknown state machine status: " + value);
                    }
                }
            }
            // Preserve existing transition-topic compatibility, including start/stop markers.
            case "started" -> publishStateChange("", fields.getOrDefault("initial", ""), "start");
            case "stopped" -> publishStateChange("unknown", "", "cancel");
            case "state_entered" -> {
                String state = fields.get("state");
                if ("End".equals(state) || "Error".equals(state) || "Fatal".equals(state)) {
                    publishStateChange(state, "", "");
                }
            }
            case "transition" -> {
                String event = fields.containsKey("declaredEventKnown")
                        ? fields.get("declaredEvent") : fields.get("event");
                if (event != null && !"null".equals(event)) {
                    publishStateChange(fields.getOrDefault("source", ""),
                            fields.getOrDefault("target", ""), event);
                }
            }
            default -> { }
        }
    }

    public abstract void publishStateChange(String from, String to, String event);

    public abstract void publishStatus(StatemachineStatus status);
}
