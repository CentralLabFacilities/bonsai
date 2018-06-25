package de.unibi.citec.clf.bonsai.engine.fxgui;


import de.unibi.citec.clf.bonsai.engine.fxgui.communication.FXGUISCXMLRemote;
import org.apache.log4j.BasicConfigurator;
import org.apache.log4j.PropertyConfigurator;
import org.kohsuke.args4j.CmdLineException;
import org.kohsuke.args4j.CmdLineParser;
import org.kohsuke.args4j.Option;
import org.kohsuke.args4j.spi.MapOptionHandler;

import java.io.InputStream;
import java.util.Map;
import java.util.prefs.Preferences;

import static de.unibi.citec.clf.bonsai.engine.SCXMLStarter.DEFAULT_INCLUDE_MAPPINGS;

/**
 * @author lruegeme
 */
public abstract class FXGUIStarter {


    static final org.apache.log4j.Logger logger = org.apache.log4j.Logger.getLogger(FXGUIStarter.class);
    final InputStream LOGGING_PROPERTIES = getClass().getResourceAsStream("/skillsLogging.properties");

    @Option(name = "-l", aliases = {"--logging"}, metaVar = "PATH", usage = "path to a log4j properties file")
    String pathToLoggingProperties = null;

    @Option(name = "-c", aliases = {"--config"}, metaVar = "PATH", usage = "path to the bonsai configuration file")
    public static String pathToConfig = null;
    @Option(name = "-t", aliases = {"--task"}, metaVar = "PATH", usage = "path to the task configuration file")
    public static String pathToTask = null;

    @Option(name = "-m", aliases = {"--mapping"}, handler = MapOptionHandler.class, usage = "Include Mappings")
    public static Map<String, String> includeMappings = DEFAULT_INCLUDE_MAPPINGS;

    @Option(name = "--help", usage = "show help output")
    private boolean help = false;

    protected FXGUIStarter(String[] args) {

        // Check arguments and set paths
        CmdLineParser parser = new CmdLineParser(this);

        try {
            parser.setUsageWidth(80);
            parser.parseArgument(args);
        } catch (CmdLineException e) {
            System.err.println(e.getMessage());
            System.err.println("FXGUIStarter [options...] arguments...");
            // print the list of available options
            parser.printUsage(System.err);
            System.err.println();
            return;
        }

        if (help) {
            System.out.println("FXGUIStarter [options...] arguments...");
            parser.printUsage(System.out);
            System.out.println();
            return;
        }

        Preferences prefs = Preferences.userRoot().node("StateMachine FXGUI");
        if (pathToConfig == null) {
            pathToConfig = prefs.get("configFilePath", ".");
        }
        if (pathToTask == null) {
            pathToTask = prefs.get("taskFilePath", ".");
        }

        initLogging();
        FXGUI.setRemote(createRemote());
        FXGUI.launch(FXGUI.class);

    }

    private void initLogging() {
        if (pathToLoggingProperties == null) {
            PropertyConfigurator.configure(LOGGING_PROPERTIES);
        } else {
            try {
                PropertyConfigurator.configure(pathToLoggingProperties);
            } catch (Exception e) {
                BasicConfigurator.configure();
            }
            logger.debug("Found logging properties file. - " + pathToLoggingProperties);
        }

        String mappings = "";
        for (Map.Entry<String, String> e : includeMappings.entrySet()) {
            mappings += e.getKey() + " = " + e.getValue() + "\n";
        }
        logger.debug("using the following includeMappings: \n" + mappings);
    }

    protected abstract FXGUISCXMLRemote createRemote();

}
