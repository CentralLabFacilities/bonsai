package de.unibi.citec.clf.bonsai.util;

import org.apache.log4j.RollingFileAppender;
import org.apache.log4j.spi.LoggingEvent;

import java.io.IOException;


/**
 * Log4j Appender, which rotates the logging files with every execution of the
 * Programm.
 *
 * @author gminareci
 */
public class ExecutionRollingFileAppender extends RollingFileAppender {

    private static boolean logged = false;

    /**
     * Constructor of the Appender, which makes an initial roll over.
     *
     * @throws IOException
     */
    public ExecutionRollingFileAppender() {
        super();
    }

    @Override
    public void append(LoggingEvent event) {
        if (!logged) {
            super.rollOver();
            logged = true;
        }
        super.append(event);
    }

    @Override
    public void setFile(String fileName) {
        super.setFile(fileName);
    }
}
