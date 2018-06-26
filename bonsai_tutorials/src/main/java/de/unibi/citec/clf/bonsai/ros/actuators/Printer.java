package de.unibi.citec.clf.bonsai.ros.actuators;

import de.unibi.citec.clf.bonsai.actuators.StringActuator;
import de.unibi.citec.clf.bonsai.core.configuration.IObjectConfigurator;
import de.unibi.citec.clf.bonsai.ros.RosNode;
import org.ros.namespace.GraphName;
import org.ros.node.ConnectedNode;

import java.io.IOException;

public class Printer extends RosNode implements StringActuator {

    private GraphName nodeName;
    private int repeat = 1;

    public Printer(GraphName gn) {
        this.initialized = false;
        this.nodeName = gn;
    }

    @Override
    public void configure(IObjectConfigurator conf) {

        this.repeat = conf.requestOptionalInt("repeat",repeat);
    }

    @Override
    public String getTarget() {
        return "";
    }

    @Override
    public GraphName getDefaultNodeName() {
        return nodeName;
    }

    @Override
    public void onStart(final ConnectedNode connectedNode) {
    }

    @Override
    public void destroyNode() {

    }

    @Override
    public void sendString(String data) throws IOException {
        for(int i=0; i<repeat; i++) System.out.println(i + ": " + data);
    }



}

