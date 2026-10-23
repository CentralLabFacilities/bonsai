package de.unibi.citec.clf.bonsai.engine.fxgui;


import de.unibi.citec.clf.bonsai.engine.SkillStateMachine;
import de.unibi.citec.clf.bonsai.engine.communication.SCXMLServer;
import de.unibi.citec.clf.bonsai.engine.communication.SCXMLServerWithControl;
import de.unibi.citec.clf.bonsai.engine.communication.RuntimePublisher;
import de.unibi.citec.clf.bonsai.engine.communication.SCXMLEventBus;
import de.unibi.citec.clf.bonsai.engine.control.StateMachineController;
import de.unibi.citec.clf.bonsai.engine.fxgui.communication.DirectControlRemote;
import de.unibi.citec.clf.bonsai.engine.fxgui.communication.FXGUISCXMLRemote;

/**
 * Created by lruegeme on 1/22/18.
 */
public class FXGUIWithServer extends FXGUIStarter {
    private static SCXMLServer server = null;
    private static SCXMLServerWithControl remoteServer = null;
    private static RuntimePublisher publisher = null;

    private DirectControlRemote rem;


    @Override
    protected FXGUISCXMLRemote createRemote() {
        SkillStateMachine skillStateMachine = new SkillStateMachine(includeMappings);

        StateMachineController stateMachineController = new StateMachineController(skillStateMachine, pathToConfig,
                pathToTask, false);

        if (publisher != null) {
            logger.info("set publisher");
            SCXMLEventBus.addListener(publisher);
        }

        if (server != null) {
            logger.info("set server");
            skillStateMachine.addServer(server);
        }

        if(remoteServer != null) {
            logger.info("set control server");
            remoteServer.setController(stateMachineController);
            skillStateMachine.addServer(remoteServer);
        }

        rem = new DirectControlRemote(stateMachineController);

        rem.setExitListener(() -> {
            if (publisher != null) SCXMLEventBus.removeListener(publisher);
            if(remoteServer != null) remoteServer.shutdown();
        });

        return rem;
    }

    private FXGUIWithServer(String[] args) {
        super(args);
    }

    public static void setServer(SCXMLServer server) {
        FXGUIWithServer.server = server;
    }

    public static void setPub(RuntimePublisher pub) {
        FXGUIWithServer.publisher = pub;
    }

    public static void setControlServer(SCXMLServerWithControl server) {
        FXGUIWithServer.remoteServer = server;
    }


    public static void main(String[] args) {
        new FXGUIWithServer(args);
    }
}
