package de.unibi.citec.clf.bonsai.engine.model;


import de.unibi.citec.clf.bonsai.core.SensorListener;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.SkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import org.apache.log4j.Logger;

import java.util.Map;

/**
 * Abstract definition of a state.
 *
 * @author nkoester
 * @author lkettenb
 */
public abstract class AbstractSkill {

    /**
     * The Logger.
     */
    protected Logger logger = Logger.getLogger(this.getClass());

    /**
     * Sets up the initial actuators and sensors required by a state.
     *
     * @param configurator
     */
    public abstract void configure(ISkillConfigurator configurator) throws SkillConfigurationException;

    /**
     * Sets up the initial references, parameters, actuators and sensors
     * required by a state.
     *
     * @return Exit status as defined in {@link ExitToken}.
     * @see ExitToken
     */
    public abstract boolean init();

    /**
     * Main function of a state that contains the actual logic and (sub-) skill.
     * <p>
     * Please note that the processing status will be set to <code>null</code>
     * before this method is invoked.
     *
     * @return Exit status as defined in {@link ExitStatus}.
     */
    public abstract ExitToken execute();

    public ExitToken execute(ExitStatus currentStatus) {
        this.exitStatus = currentStatus;
        return execute();
    }

    /**
     * Function that is called after the main functional part of a state has
     * been executed. Use this function to clean up.
     * <p>
     * This function is called even when the state FATALed.
     * <p>
     * The information (state FATALed or not) is saved in protected the variable
     * {
     *
     * @param curToken
     * @return Exit status as defined in {@link ExitStatus}.
     * @see #stateFATALed .
     */
    public abstract ExitToken end(ExitToken curToken);

    public ExitToken endSkill(ExitToken currentStatus) {
        this.exitStatus = currentStatus.getExitStatus();
        return end(currentStatus);
    }

    public void cleanUp(SkillConfigurator configurator) {

        // remove this as listeners from all sensors
        if (this instanceof SensorListener) {
            Map<String, Sensor<?>> sensors = configurator.getSensorReferences();
            sensors.values().forEach(sensor -> sensor.removeSensorListener((SensorListener) this));
        }

    }

    /**
     * Current exit status.
     */
    private ExitStatus exitStatus;

    /**
     * Returns the current exit status.
     *
     * @return The current exit status.
     * @see ExitStatus
     */
    protected final ExitStatus getCurrentStatus() {
        return exitStatus;
    }

}
