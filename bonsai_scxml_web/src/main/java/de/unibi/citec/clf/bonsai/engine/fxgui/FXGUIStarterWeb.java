package de.unibi.citec.clf.bonsai.engine.fxgui;

import de.unibi.citec.clf.bonsai.engine.SCXMLStarterWeb;
import de.unibi.citec.clf.bonsai.engine.fxgui.communication.FXGUISCXMLRemote;
import de.unibi.citec.clf.bonsai.engine.fxgui.communication.web.RemoteWebController;
import org.kohsuke.args4j.Option;

/**
 * @author lruegeme
 */
public class FXGUIStarterWeb extends FXGUIStarter {

    public static void main(String[] args) {
        new FXGUIStarterWeb(args);
    }

    @Option(name = "-p", aliases = {"--port"}, metaVar = "VALUE", usage = "port to listen")
    public static int port = 8080;

    @Option(name = "-h", aliases = {"--host"}, metaVar = "VALUE", usage = "ip address to listen")
    public static String host = "localhost";

    private FXGUIStarterWeb(String[] args) {
        super(args);
    }

    @Override
    protected FXGUISCXMLRemote createRemote() {

        RemoteWebController srv = new RemoteWebController(host, port);

        try {
            return srv;
        } catch (Exception ex) {
            logger.fatal(ex);
            System.exit(0);
        }
        return null;
    }

}
