package de.unibi.citec.clf.bonsai.engine.communication;

import de.unibi.citec.clf.bonsai.engine.communication.SCXMLEventFactory.SCXMLEvent;
import java.util.function.Consumer;

/** Adapter for external transition publishers. **/
public abstract class StateChangePublisher implements Consumer<SCXMLEvent> {
    @Override
    public void accept(SCXMLEvent change) {
        var fields = change.details();
        switch (change.type()) {
            case "started" -> publish("", fields.getOrDefault("initial", ""), "start");
            case "stopped" -> publish("unknown", "", "cancel");
            case "state_entered" -> {
                String state = fields.get("state");
                if ("End".equals(state) || "Error".equals(state) || "Fatal".equals(state)) {
                    publish(state, "", "");
                }
            }
            case "transition" -> {
                String event = fields.containsKey("declaredEventKnown")
                        ? fields.get("declaredEvent") : fields.get("event");
                if (event != null && !"null".equals(event)) {
                    publish(fields.getOrDefault("source", ""), fields.getOrDefault("target", ""), event);
                }
            }
            default -> { }
        }
    }

    public abstract void publish(String from, String to, String transition);
}
