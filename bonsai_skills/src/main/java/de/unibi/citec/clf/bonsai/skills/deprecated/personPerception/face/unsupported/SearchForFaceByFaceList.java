package de.unibi.citec.clf.bonsai.skills.deprecated.personPerception.face.unsupported;

import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;

/**
 * In this state the robot tries to recognize the person standing in front of him.
 *
 * @author lruegeme
 */
public class SearchForFaceByFaceList extends AbstractSkill {

    //defaults
    private int timeout = 10000;

    //constants
    private static final int TIME_TO_SLEEP = 200;

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenNotThere;

    //private FaceIdentificationList faceList = new FaceIdentificationList();

    //Sensors
    //private Sensor<FaceIdentificationList> faceSensor;

    //Slots
    //private MemorySlot<FaceIdentificationList> faceListS;

    private MemorySlot<String> foundFaceS;

    @Override
    public void configure(ISkillConfigurator configurator) {

        //faceSensor = configurator.getSensor("FaceIdentificationSensor", FaceIdentificationList.class);

        //faceListS = configurator.getSlot("faceList", FaceIdentificationList.class);
        foundFaceS = configurator.getSlot("foundFace", String.class);

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenNotThere = configurator.requestExitToken(ExitStatus.SUCCESS().ps("NotThere"));

    }

    @Override
    public boolean init() {

        /*try {
            faceList = faceListS.recall();
        } catch (CommunicationException ex) {
            logger.fatal("cant read face list!");
            return false;
        }

        //quick and dirty aka kgardeja
        if (faceList == null) {
            faceList = new FaceIdentificationList();
        }*/

        started = Time.currentTimeMillis();

        return true;
    }

    long started = -1;

    @Override
    public ExitToken execute() {

        // read faces
        /*
        FaceIdentificationList list;
        try {
            list = faceSensor.readLast(100);
            if (list == null || list.size() == 0) {
                throw new IOException();
            }
        } catch (IOException | InterruptedException e) {
            logger.error(" got no data from face sensor");
            return ExitToken.loop(TIME_TO_SLEEP);
        }
        logger.debug("faceSensor has returned " + list.size() + " faces!");
        // find  face
        for (FaceIdentificationList.FaceIdentification sensorFace : list) {
            for (FaceIdentificationList.FaceIdentification storedFace : faceList) {
                if (sensorFace.getClassId() == storedFace.getClassId()) {
                    try {
                        foundFaceS.memorize(sensorFace.getName());
                    } catch (CommunicationException ex) {
                        logger.fatal("cant memorize to memory");
                    }
                    return tokenSuccess;
                }
            }
        }
*/

        if (started + timeout > Time.currentTimeMillis()) {
            return ExitToken.loop(TIME_TO_SLEEP);
        } else {
            return tokenNotThere;
        }
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
