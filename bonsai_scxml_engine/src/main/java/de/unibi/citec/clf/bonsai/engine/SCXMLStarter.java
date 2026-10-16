package de.unibi.citec.clf.bonsai.engine;

import de.unibi.citec.clf.bonsai.monitoring.events.BonsaiEventBus;
import de.unibi.citec.clf.bonsai.monitoring.events.RuntimeEventRecorder;
import de.unibi.citec.clf.bonsai.engine.events.ScxmlEvents;
import de.unibi.citec.clf.bonsai.engine.communication.SCXMLServer;
import de.unibi.citec.clf.bonsai.engine.control.StateMachineController;
import de.unibi.citec.clf.bonsai.util.ExecutionRollingFileAppender;
import org.apache.log4j.BasicConfigurator;
import org.apache.log4j.FileAppender;
import org.apache.log4j.Logger;
import org.apache.log4j.PropertyConfigurator;
import org.apache.log4j.helpers.OptionConverter;
import org.kohsuke.args4j.CmdLineException;
import org.kohsuke.args4j.CmdLineParser;
import org.kohsuke.args4j.Option;
import org.kohsuke.args4j.spi.MapOptionHandler;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.net.URL;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;
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

    /**
     * Starts recording to a new JSONL file alongside the configured Log4j file.
     * The Log4j appender is the source of truth for the directory, so -l and
     * custom logging properties automatically affect both kinds of logs.
     */
    private void startEventRecording() {
        FileAppender fileAppender = configuredLogFileAppender();
        if (fileAppender == null || fileAppender.getFile() == null) {
            System.err.println("Bonsai event recording disabled: no active Log4j file appender. "
                    + "Check the logging configuration selected with -l.");
            return;
        }

        Path logPath = Path.of(fileAppender.getFile()).toAbsolutePath();
        String logName = logPath.getFileName().toString();
        int extension = logName.lastIndexOf('.');
        String prefix = extension > 0 ? logName.substring(0, extension) : logName;
        String stamp = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss-SSS"));
        Path eventPath = logPath.resolveSibling(prefix + "-events-" + stamp
                + "-" + ProcessHandle.current().pid() + ".jsonl");

        RuntimeEventRecorder recorder = new RuntimeEventRecorder();
        try {
            recorder.start(eventPath);
            Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                try {
                    recorder.stop();
                } catch (IOException e) {
                    LOG.error("Failed to finish Bonsai event recording", e);
                }
            }, "bonsai-event-recording-shutdown"));
            LOG.info("Recording Bonsai runtime events to " + eventPath);
            System.err.println("Bonsai event recording: " + eventPath);
        } catch (IOException | RuntimeException e) {
            LOG.error("Unable to start Bonsai runtime event recording at " + eventPath, e);
            System.err.println("Bonsai event recording failed at " + eventPath + ": " + e);
            try {
                recorder.stop();
            } catch (IOException stopError) {
                LOG.warn("Unable to close Bonsai runtime event recorder", stopError);
            }
        }
    }

    /** Find the rolling log file if present, otherwise any configured root file appender. */
    private static FileAppender configuredLogFileAppender() {
        FileAppender fallback = null;
        for (Enumeration<?> appenders = Logger.getRootLogger().getAllAppenders();
             appenders.hasMoreElements(); ) {
            Object appender = appenders.nextElement();
            if (appender instanceof ExecutionRollingFileAppender rolling && rolling.getFile() != null) {
                return rolling;
            }
            if (appender instanceof FileAppender file && file.getFile() != null && fallback == null) {
                fallback = file;
            }
        }
        return fallback;
    }

    /**
     * Log4j's file appender does not create missing parent directories.
     * Prepare them using the same file properties that Log4j will read.
     */
    private static void createLogDirectories(Properties properties) throws IOException {
        for (String key : properties.stringPropertyNames()) {
            if (!key.startsWith("log4j.appender.")
                    || !key.toLowerCase(Locale.ROOT).endsWith(".file")) {
                continue;
            }
            String configuredPath = properties.getProperty(key).trim();
            if (configuredPath.isEmpty()) {
                continue;
            }
            String resolvedPath = OptionConverter.substVars(configuredPath, properties);
            Path directory = Path.of(resolvedPath).toAbsolutePath().getParent();
            if (directory != null) {
                Files.createDirectories(directory);
            }
        }
    }

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
                // The bundled resource also works when the application runs from a JAR.
                URL defaultResource = getClass().getResource("/skillsLogging.properties");
                boolean useBundledResource = defaultResource != null
                        && pathToLoggingProperties.equals(defaultResource.getPath());

                Properties properties = new Properties();
                try (InputStream input = useBundledResource
                        ? defaultResource.openStream()
                        : Files.newInputStream(Path.of(pathToLoggingProperties))) {
                    properties.load(input);
                }
                createLogDirectories(properties);

                if (useBundledResource) {
                    PropertyConfigurator.configure(defaultResource);
                } else {
                    PropertyConfigurator.configure(pathToLoggingProperties);
                }
                LOG.debug("Found logging properties file. - " + pathToLoggingProperties);
            } catch (Exception e) {
                System.err.println("Unable to configure Bonsai logging from "
                        + pathToLoggingProperties + ": " + e);
                BasicConfigurator.configure();
            }
        }

        startEventRecording();

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

        BonsaiEventBus.publish(ScxmlEvents.status(skillStateMachine.getStatemachineStatus().name()));
    }

    public abstract SCXMLServer createServer();


}
