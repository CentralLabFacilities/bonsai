package de.unibi.citec.clf.bonsai.skills.helper;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.units.TimeUnit;

import java.util.Date;

/**
 * @author kkonen
 */
public class CheckTime extends AbstractSkill {

    static final String KEY_START = "#_START";
    static final String KEY_REQUEST_TIME = "#_REQUEST_TIME";
    static final String KEY_TIME_LIMIT = "#_TIME_LIMIT";

    //defaults
    Boolean start_time = false;
    Boolean request_time = false;
    int time_limit = 180;           // Seconds! 

    private Boolean start_Time;
    private Boolean request_Time;
    private int time_Limit;

    private ExitToken tokenSuccessStart;
    private ExitToken tokenSuccessTimeNotExceeded;
    private ExitToken tokenSuccessTimeExceeded;
    private ExitToken tokenError;

    private NavigationGoalData time_created;

    private MemorySlot<NavigationGoalData> start_time_slot;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccessStart = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("start"));
        tokenSuccessTimeNotExceeded = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("timeNotExceeded"));
        tokenSuccessTimeExceeded = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("timeExceeded"));
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        start_time_slot = configurator.getSlot("StartTimeSlot", NavigationGoalData.class);

        start_Time = configurator.requestOptionalBool(KEY_START, start_time);
        request_Time = configurator.requestOptionalBool(KEY_REQUEST_TIME, request_time);
        time_Limit = configurator.requestOptionalInt(KEY_TIME_LIMIT, time_limit);

    }

    @Override
    public boolean init() {
        time_created = new NavigationGoalData();
        if (start_time_slot != null) {
            try {
                time_created = start_time_slot.recall();
                logger.debug("start time already set!");
            } catch (CommunicationException ex) {
                logger.error("getting start time failed");
                return false;
            }
        }
        return true;
    }

    @Override
    public ExitToken execute() {
        Date now = new Date();
        if (start_Time) {
            time_created.getTimestamp().setCreated(now.getTime(), TimeUnit.MILLISECONDS);
            try {
                start_time_slot.memorize(time_created);
            } catch (CommunicationException ex) {
                logger.error(ex.getMessage());
            }
            return tokenSuccessStart;
        }
        if (request_time) {
            if ((now.getTime() - time_created.getTimestamp().getCreated(TimeUnit.MILLISECONDS)) / 1000 >= time_limit) {
                return tokenSuccessTimeExceeded;
            }
            return tokenSuccessTimeNotExceeded;
        }
        return tokenError;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
