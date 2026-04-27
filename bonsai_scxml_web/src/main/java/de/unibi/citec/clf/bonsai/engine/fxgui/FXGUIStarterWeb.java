package de.unibi.citec.clf.bonsai.engine.fxgui;

import de.unibi.citec.clf.bonsai.engine.SCXMLStarterWeb;
import de.unibi.citec.clf.bonsai.engine.fxgui.communication.FXGUISCXMLRemote;
import de.unibi.citec.clf.bonsai.engine.fxgui.communication.RemoteWebController;
import org.kohsuke.args4j.Option;

/**
 * @author lruegeme
 */
public class FXGUIStarterWeb extends FXGUIStarter {

    /**
     * @param args the command line arguments
     */
    public static void main(String[] args) {
        new FXGUIStarterWeb(args);
    }

    @Option(name = "-b", aliases = {"--bonsai_server"}, metaVar = "VALUE", usage = "scope for bonsai (the server that gets the xml files), default is: "
            + SCXMLStarterWeb.DEFAULT_SERVER_TOPIC)
    public static String bonsaiScope = SCXMLStarterWeb.DEFAULT_SERVER_TOPIC;

    private FXGUIStarterWeb(String[] args) {
        super(args);
    }

    @Override
    protected FXGUISCXMLRemote createRemote() {


        RemoteWebController srv = new RemoteWebController();

        try {
            return srv;
        } catch (Exception ex) {
            logger.fatal(ex);
            System.exit(0);
        }
        return null;
    }

}
