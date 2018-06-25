package de.unibi.citec.clf.bonsai.skills.deprecated.personPerception.unsupported;



import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill; 
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import java.io.IOException;

/**
 * This state just trains the so far learned faces by the faceSensor.
 *
 * @author vlosing
 */
@Deprecated
public class TrainFaces extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccess;

    /*
     * Sensors used by this state.
     */
    //unsupported private FaceIdentificationSensor2 faceSensor;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        /*faceSensor = (FaceIdentificationSensor2) configurator.getSensor(
                "FaceIdentificationSensor", FaceIdentificationList.class);*/
    }

    @Override
    public boolean init() {
        // Initialize sensors

        return true;
    }

    @Override
    public ExitToken execute() {
        /*
        try {
            logger.debug("faces training started");
            faceSensor.trainNow();
        } catch (IOException e) {
            logger.warn(e.getMessage());
        }*/
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return tokenSuccess;
    }
}
