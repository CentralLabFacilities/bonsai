package de.unibi.citec.clf.bonsai.engine;

import de.unibi.citec.clf.bonsai.engine.communication.SCXMLServer;
import de.unibi.citec.clf.bonsai.engine.control.StateMachineController;
import org.apache.log4j.BasicConfigurator;
import org.apache.log4j.Logger;
import org.apache.log4j.PropertyConfigurator;
import org.kohsuke.args4j.CmdLineException;
import org.kohsuke.args4j.CmdLineParser;
import org.kohsuke.args4j.Option;
import org.kohsuke.args4j.spi.MapOptionHandler;

import java.util.HashMap;
import java.util.Map;
import java.util.prefs.Preferences;

/**
 * Starts the state machine.
 *
 * @author lkettenb
 */
public abstract class SCXMLStarter {

    /**
     * The log.
     */
    static final Logger LOG = Logger.getLogger(SCXMLStarter.class);

    private static final String PATH_TO_STATEMACHINES = System.getProperty("user.dir") + "/src/main/config/state_machines";
    public static Map<String, String> DEFAULT_INCLUDE_MAPPINGS;

    static {
        DEFAULT_INCLUDE_MAPPINGS = new HashMap<>();
        DEFAULT_INCLUDE_MAPPINGS.put("SCXML", PATH_TO_STATEMACHINES);
    }

    /**
     * Default path to logging properties file.
     */
    protected final String PATH_TO_LOGGING_PROPERTIES = getClass().getResource("/skillsLogging.properties")
            .getPath();
    @Option(name = "-c", aliases = {"--config"}, metaVar = "PATH", usage = "path to the bonsai configuration file")
    protected String pathToConfig = null;
    @Option(name = "-t", aliases = {"--task"}, metaVar = "PATH", usage = "path to the task configuration file")
    protected String pathToTask = null;
    @Option(name = "-l", aliases = {"--logging"}, metaVar = "PATH", usage = "path to a log4j properties file")
    protected String pathToLoggingProperties = PATH_TO_LOGGING_PROPERTIES;
    @Option(name = "-d", aliases = {"--delay"}, metaVar = "VALUE", usage = "time in milliseconds until the state machine will start automatically")
    protected long autoStartDelay = -1;
    @Option(name = "--eof", usage = "exit on failure")
    protected static boolean exitOnFaliure = false;
    @Option(name = "--help", usage = "show help output")
    protected boolean help = false;
    @Option(name = "--headless", usage = "dont activate server")
    protected boolean headless = false;

    @Option(name = "-m", aliases = {"--mapping"}, handler = MapOptionHandler.class, usage = "Mapping ")
    protected Map<String, String> includeMappings = DEFAULT_INCLUDE_MAPPINGS;

    private Preferences prefs;
    StateMachineController stateMachineController;
    SkillStateMachine skillStateMachine;

    CmdLineParser parser;

    protected SCXMLStarter() {
    }

    public void startup(String[] args) {
        parser = new CmdLineParser(this);

        try {
            parser.setUsageWidth(80);
            parser.parseArgument(args);
        } catch (CmdLineException e) {
            System.err.println(e.getMessage());
            System.err.println("SCXMLStarter [options...] arguments...");
            // print the list of available options
            parser.printUsage(System.err);
            System.err.println();
            return;
        }

        handleDefaultArguments();
        init(pathToConfig, pathToTask, pathToLoggingProperties);
    }

    private void handleDefaultArguments() {
        if (help) {
            System.out.println("SCXMLStarter [options...] arguments...");
            parser.printUsage(System.out);
            System.out.println();
            return;
        }

        System.out.println("starting statemachine runner...");

        if (autoStartDelay >= 0 && (pathToConfig == null || pathToTask == null)) {
            System.out.println("You specified a timer but not a configuration "
                    + "AND a task file. This can result in obscure behavior.");
        }

        if (headless && (pathToConfig == null || pathToTask == null)) {
            System.out.println("You specified a headless but not a configuration "
                    + "AND a task file. EXITING");
            System.out.println(pathToConfig + " \n" + pathToTask);
            System.exit(0);
        }
    }

    private void init(String pathToConfig, String pathToTask, String pathToLoggingProperties) {

        // Look for logging properties file.
        if (pathToLoggingProperties == null) {
            BasicConfigurator.configure();
            LOG.error("Did not find logging properties file.");
        } else {
            try {
                PropertyConfigurator.configure(pathToLoggingProperties);
            } catch (Exception e) {
                BasicConfigurator.configure();
            }
            LOG.debug("Found logging properties file. - " + pathToLoggingProperties);
        }

        prefs = Preferences.userRoot().node("StateMachineViewer");
        if (pathToConfig == null) {
            pathToConfig = prefs.get("configFilePath", ".");
        }
        if (pathToTask == null) {
            pathToTask = prefs.get("taskFilePath", ".");
        }
        StringBuilder mappings = new StringBuilder();
        for (Map.Entry<String, String> e : includeMappings.entrySet()) {
            mappings.append(e.getKey()).append(" = ").append(e.getValue()).append("\n");
        }
        LOG.debug("using the following includeMappings: \n" + mappings);

        skillStateMachine = new SkillStateMachine(includeMappings);

        stateMachineController = new StateMachineController(skillStateMachine, pathToConfig,
                pathToTask, exitOnFaliure);

        skillStateMachine.addServer(createServer());


        if (headless) {
            if (autoStartDelay == -1) {
                LOG.warn("headless has no autostart delay, setting to instant start");
                autoStartDelay = 0;
            }
            stateMachineController.initialize(autoStartDelay, pathToLoggingProperties);
        } else {
            stateMachineController.initialize(autoStartDelay, pathToLoggingProperties);
        }

    }

    public abstract SCXMLServer createServer();


}
