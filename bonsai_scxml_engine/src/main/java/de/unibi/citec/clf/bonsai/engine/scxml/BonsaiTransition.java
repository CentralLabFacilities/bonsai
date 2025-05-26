package de.unibi.citec.clf.bonsai.engine.scxml;


import org.apache.commons.scxml2.model.Transition;

import java.util.stream.Collectors;

public class BonsaiTransition {

    private String event = "";

    public String getEvent() {
        return event;
    }

    public String getFrom() {
        return from;
    }

    public void setFrom(String from) {
        this.from = from;
    }

    public String getTo() {
        return to;
    }

    private String from = "";
    private String to = "";

    static public BonsaiTransition of(Transition t) {
        final BonsaiTransition ret = new BonsaiTransition();
        ret.event = (t.getEvent() != null) ? t.getEvent() : "";
        ret.to = (t.getTargets().isEmpty()) ? t.getTargets().stream().map(it -> it.getId()).collect(Collectors.joining(", ")) : "";
        return ret;
    }
}
