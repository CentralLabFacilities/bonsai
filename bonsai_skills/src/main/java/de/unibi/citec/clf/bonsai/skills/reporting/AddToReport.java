package de.unibi.citec.clf.bonsai.skills.reporting;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;

import java.util.regex.Matcher;

/**
 * This class is used add a Message to a Report, which can easily be told at the end of any statemachine.
 * Works analogous to SaySlot.
 *
 * <pre>
 *
 * Options:
 *  #_MESSAGE:      [String] Optional (default: "$S")
 *                      -> Text said by the robot. $S will be replaced by memory slot content
 *
 * Slots:
 *  InfoSlot: [String] [Read]
 *      -> String to incorporate into report's message
 *  ReportSlot: [String] [Read/Write]
 *      -> String which represents the report
 *
 * ExitTokens:
 *  success:    report updated successfully
 *  error:      report could not be updated
 *
 *
 * Sensors:
 *
 * Actuators:
 *  SpeechActuator: [SpeechActuator]
 *      -> Used to say #_MESSAGE
 *
 * </pre>
 *
 *
 * @author rfeldhans
 *
 */
public class AddToReport extends AbstractSkill {

    private static final String KEY_MESSAGE = "#_MESSAGE";
    private static final String REPLACE_STRING = "$S";

    private String sayText = REPLACE_STRING;

    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private MemorySlotReader<String> infoSlot;
    private MemorySlotReader<String> reportReadSlot;
    private MemorySlotWriter<String> reportWriteSlot;

    private String report;


    @Override
    public void configure(ISkillConfigurator configurator) {
        sayText = configurator.requestOptionalValue(KEY_MESSAGE, sayText);

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError =configurator.requestExitToken(ExitStatus.ERROR());

        infoSlot = configurator.getReadSlot("InfoSlot", String.class);
        reportReadSlot = configurator.getReadSlot("ReportSlot", String.class);
        reportWriteSlot = configurator.getWriteSlot("ReportSlot", String.class);
    }

    @Override
    public boolean init() {

        try {
            report = reportReadSlot.recall();
        } catch (CommunicationException ex) {
            logger.error("Could not read from ReportSlot", ex);
            return false;
        }
        if (report == null) {
            logger.info("String from slot is null, will be set to empty string.");
            report = "";
        }

        String info;

        try {
            info = infoSlot.recall();
        } catch (CommunicationException ex) {
            logger.error("Could not read from InfoSlot", ex);
            return false;
        }
        if (report == null) {
            logger.info("String from slot is null, will be set to empty string.");
            info = "";
        }


        report += sayText.replaceAll(Matcher.quoteReplacement(REPLACE_STRING), info);
        report = report.replaceAll("_", " ");
        return true;
    }

    @Override
    public ExitToken execute() {
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()){
            try {
                reportWriteSlot.memorize(report);
            } catch (CommunicationException ex) {
                logger.error("Could not memorize Report");
                return tokenError;
            }
        }
        return curToken;
    }
}
