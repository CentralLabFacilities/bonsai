package de.unibi.citec.clf.bonsai.skills.deprecated.personPerception.face;

import de.unibi.citec.clf.bonsai.actuators.SpeechActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.person.PersonData;
import java.io.IOException;

/**
 * In this skill, the robot turns towards the face of a person given Person or Face ID.
 *
 * @author climberg, lruegeme
 */
public class TurnTowardsFace extends AbstractSkill {

    //Datamodel Keys
    private static final String KEY_ID = "#_ID";
    private static final String KEY_TIMEOUT = "#_TIMEOUT";
    private static final String KEY_USE_CLASS_ID = "#_USE_CLASS_ID";
    private static final String KEY_IMAGEWIDTH = "#_IMAGEWIDTH";
    private static final String KEY_IMAGEHEIGHT = "#_IMAGEHEIGHT";
    //private static final String KEY_IMG_W = "#_IMG_W";
    //private static final String KEY_IMG_H = "#_IMG_H";
    //private static final String KEY_FOV_X = "#_FOV_X";

    //defaults
    private boolean useClassId = false;
    private long timeout = -1;
    int imgW = 640;
    int imgH = 480;
    double fov_x = Math.toRadians(70.42); //v 43.3

    private static final int TIME_TO_SLEEP = 500;

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenError;
    private ExitToken tokenSuccessTimeout;

    //Sensors
    //private Sensor<FaceIdentificationList> faceSensor;
    private Sensor<List<PersonData>> personSensor;
    private Sensor<PositionData> positionSensor;

    //Actuator
    private SpeechActuator speechActuator;

    //Slots
    private MemorySlot<List<PersonData>> knownPersonsMemorySlot;
    private MemorySlot<String> personIdSlot;
    private MemorySlot<NavigationGoalData> navigationGoalDataSlot;

    private List<PersonData> knownPersonDataList;

    private String idToSearch = "-1";

    @Override
    public void configure(ISkillConfigurator configurator) {
        navigationGoalDataSlot = configurator.getSlot("NavigationGoalDataSlot", NavigationGoalData.class);
        //faceSensor = configurator.getSensor("FaceIdentificationSensor", FaceIdentificationList.class);
        personSensor = configurator.getSensor("PersonSensor", List.getListClass(PersonData.class));
        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);

        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, (int) timeout);
        useClassId = configurator.requestOptionalBool(KEY_USE_CLASS_ID, useClassId);
        imgH = configurator.requestOptionalInt(KEY_IMAGEHEIGHT, imgH);
        imgW = configurator.requestOptionalInt(KEY_IMAGEWIDTH, imgW);

        idToSearch = configurator.requestOptionalValue(KEY_ID, idToSearch);
        if (idToSearch.equals("-1")) {
            logger.info(" -> using slot");
            personIdSlot = configurator.getSlot("IdSlot", String.class);
            //logger.fatal(ex);
            //throw new SkillConfigurationException(ex.getMessage());
        }

        if (!useClassId) {
            knownPersonsMemorySlot = configurator.getSlot("KnownPersonsSlot", List.getListClass(PersonData.class));
        }

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        if (timeout > 0) {
            tokenSuccessTimeout = configurator.requestExitToken(ExitStatus.SUCCESS().ps("timeout"));
        }

        speechActuator = configurator.getActuator("SpeechActuator", SpeechActuator.class);

    }

    @Override
    public boolean init() {
        if (timeout > 0) {
            logger.info("using timeout of " + timeout + "ms");
            timeout += System.currentTimeMillis();
        }

        logger.fatal("1");
        if (idToSearch.equals("-1")) {
            try {
                idToSearch = personIdSlot.recall();
                logger.debug("IdSlot: " + idToSearch);
            } catch (CommunicationException ex) {
                logger.fatal("Exception while reading from faceIdSlot");
                return false;
            }
        }

        logger.error("2" + idToSearch);
        if (!useClassId) {
            // read list of known persons from memory
            try {
                knownPersonDataList = knownPersonsMemorySlot.recall();
                logger.debug("knownpersonlist: " + knownPersonDataList);
            } catch (CommunicationException ex) {
                logger.fatal("Exception while reading from personDataMemorySlot");
                return false;
            }

            if (knownPersonDataList == null || knownPersonDataList.isEmpty()) {
                logger.warn("no PersonDataList of known Persons in Memory found or empty");
                return false;
            }

            boolean found = false;
            for (PersonData p : knownPersonDataList) {
                if (p.getUuid().equals(idToSearch)) {
                    found = true;
                    logger.info("known person with id:" + idToSearch + " has face:" + "invalid");
                    //idToSearch = Integer.toString(p.getFaceId()); //hack. i am not proud of this
                    break;
                }
            }

            if (!found) {
                logger.error("person with id: " + idToSearch + " not found ");
                return false;
            }
        }

        logger.error("3");
        logger.info("searching for face with id: " + idToSearch);

        return true;
    }

    @Override
    public ExitToken execute() {
        /*
        if (timeout > 0) {
            if (System.currentTimeMillis() > timeout) {
                logger.info("WaitForPerson timeout");
                return tokenSuccessTimeout;
            }
        }

        // read faces
        FaceIdentificationList list;
        try {
            list = faceSensor.readLast(1000);
            if (list == null || list.size() == 0) {
                throw new IOException();
            }
        } catch (IOException | InterruptedException e) {
            logger.error("got no data from face sensor");
            return ExitToken.loop(TIME_TO_SLEEP);
        }

        // find  face
        for (FaceIdentificationList.FaceIdentification face : list) {
            if (Integer.toString(face.getClassId()).equals(idToSearch)) {// even dirtier hack. refacot to something usable someday.

                double angle = this.getAngleFromFacePos(face.getRegionX() + face.getRegionWidth() / 2, face.getRegionY());
                NavigationGoalData ngd = new NavigationGoalData();
                ngd.setType(NavigationGoalData.GoalType.LOCAL);
                ngd.setX(0, LengthUnit.METER);
                ngd.setY(0, LengthUnit.METER);
                ngd.setYaw(-angle, AngleUnit.RADIAN); //set negative angle as yaw

                logger.debug("turn angle " + -angle + " face region is " + face.getRegionX() + " and RegionWidth is " + face.getRegionWidth());

                try {
                    navigationGoalDataSlot.memorize(ngd);
                } catch (CommunicationException e) {
                    logger.error("Cannot communicate with memory: " + e.getMessage());
                    logger.debug("Cannot communicate with memory: " + e.getMessage(), e);
                    return tokenError;
                }

                return tokenSuccess;
            }
        }
*/
        return ExitToken.loop(TIME_TO_SLEEP);

    }

    @Override
    public ExitToken end(ExitToken curToken) {

        return curToken;

    }

    /**
     * Use speech actuator to say something and catch IO exception.
     *
     * @param text Text to be said.
     */
    private void say(String text) {
        try {
            speechActuator.say(text);
        } catch (IOException ex) {
            // Not so bad. The robot just says nothing.
            logger.warn(ex.getMessage());

        }
    }

    /**
     * get an angle of the position of an object in an image (2d)
     *
     * @param faceX
     * @param faceY
     * @return
     */
    public double getAngleFromFacePos(int faceX, int faceY) {

        //TODO: set this values
        int faceWidth = 1;
        int faceHeight = 1;

        int x = faceX;
        int y = faceY;
        int centerH = x + faceWidth / 2;

        double angleCenterH = fov_x * centerH / imgW;

        double halfAngle = angleCenterH - fov_x / 2;

        return halfAngle;
    }

}
