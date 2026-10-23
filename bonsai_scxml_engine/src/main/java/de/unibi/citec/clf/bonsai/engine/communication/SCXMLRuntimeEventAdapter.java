package de.unibi.citec.clf.bonsai.engine.communication;

import de.unibi.citec.clf.bonsai.engine.communication.SCXMLEventFactory.*;
import java.util.function.Consumer;

/** Translates typed SCXML runtime notifications into external transition and status publications. */
public abstract class SCXMLRuntimeEventAdapter implements Consumer<SCXMLEvent> {
    @Override
    public void accept(SCXMLEvent change) {
        switch (change) {
            case StatusChanged status:
                publishStatus(status.status());
                break;
            case Started started:
                publishStateChange("", started.initial() == null ? "" : started.initial(), "start");
                break;
            case StateEntered entered:
                publishStateChange(entered.state(), "", "");
                break;
            case TransitionOccurred transition:
                String trigger = transition.declaredEventKnown()
                        ? transition.declaredEvent() : transition.event();
                if (trigger != null && !"null".equals(trigger)) {
                    publishStateChange(transition.source() == null ? "" : transition.source(),
                            transition.target() == null ? "" : transition.target(), trigger);
                }
                break;
            case Completed completed:
                break;
            case DatamodelAssignment datamodelAssignment:
                break;
            case DatamodelScopeInitialized datamodelScopeInitialized:
                break;
            case ExternalParameter externalParameter:
                break;
            case ObservationIncomplete observationIncomplete:
                break;
            case ParameterResolved parameterResolved:
                break;
            case SendRequested sendRequested:
                break;
            case StateExited stateExited:
                break;
            case Stopped stopped:
                break;
        }
    }

    public abstract void publishStateChange(String from, String to, String event);

    public abstract void publishStatus(StatemachineStatus status);
}
