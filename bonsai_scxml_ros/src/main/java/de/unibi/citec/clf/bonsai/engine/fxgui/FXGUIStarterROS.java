package de.unibi.citec.clf.bonsai.engine.fxgui;

import de.unibi.citec.clf.bonsai.engine.SCXMLStarterROS;
import de.unibi.citec.clf.bonsai.engine.fxgui.communication.FXGUISCXMLRemote;
import de.unibi.citec.clf.bonsai.engine.fxgui.communication.RemoteROSController;
import de.unibi.citec.clf.bonsai.ros.RosFactory;
import org.kohsuke.args4j.Option;
import org.ros.namespace.GraphName;

import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeoutException;

/**
 * @author lruegeme
 */
public class FXGUIStarterROS extends FXGUIStarter {

    /**
     * @param args the command line arguments
     */
    public static void main(String[] args) {
        new FXGUIStarterROS(args);
    }

    @Option(name = "-b", aliases = {"--bonsai_server"}, metaVar = "VALUE", usage = "scope for bonsai (the server that gets the xml files), default is: "
            + SCXMLStarterROS.DEFAULT_SERVER_TOPIC)
    public static String bonsaiScope = SCXMLStarterROS.DEFAULT_SERVER_TOPIC;

    private FXGUIStarterROS(String[] args) {
        super(args);
    }

    @Override
    protected FXGUISCXMLRemote createRemote() {

        RosFactory fac = new RosFactory();
        RemoteROSController srv = new RemoteROSController(GraphName.of("bonsai/fxgui"), bonsaiScope);

        try {
            fac.spawnRosNode(srv, true);
        } catch (TimeoutException | ExecutionException | InterruptedException ex) {
            logger.fatal(ex);
        }

        try {
            return srv;
        } catch (Exception ex) {
            logger.fatal(ex);
            System.exit(0);
        }
        return null;
    }

}
