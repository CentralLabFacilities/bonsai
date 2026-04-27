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
