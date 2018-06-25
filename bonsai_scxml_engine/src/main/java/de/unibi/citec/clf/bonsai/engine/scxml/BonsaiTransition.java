package de.unibi.citec.clf.bonsai.engine.scxml;


import org.apache.commons.scxml.model.Transition;

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
        ret.to = (t.getTarget() != null) ? t.getTarget().getId() : "";

        return ret;
    }
}
