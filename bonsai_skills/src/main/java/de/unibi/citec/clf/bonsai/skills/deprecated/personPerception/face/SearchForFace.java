package de.unibi.citec.clf.bonsai.skills.deprecated.personPerception.face;

import de.unibi.citec.clf.bonsai.actuators.SpeechActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import java.io.IOException;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * In this state the robot tries to recognize the person standing in front of him.
 *
 * @author lruegeme
 */
/*
public class SearchForFace extends AbstractSkill {

    //defaults
    private int timeout = 10000;

    //constants
    private static final int TIME_TO_SLEEP = 500;

    //Datamodel Keys
    private static final String KEY_ID = "#_FACEID";
    private static final String KEY_TIMEOUT = "#_TIMEOUT";
    private static final String KEY_KNOWN = "#_KNOWNPERSON";
    private static final String KEY_NAME = "#_SAVENAME";
    private static final String KEY_SAY = "#_SAY_INFO";
    private static final String KEY_ALL = "#_ALL_FACES";
    private static final String KEY_HEIGHT = "#_SAVEHEIGHT";

    //defaults
    private int faceIdToSearch = -1;
    private boolean known = false;
    private boolean name = true;
    private boolean sayInfo = false;
    private boolean allFaces = false;
    private boolean height = false;

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenErrorTimeout;
    private ExitToken tokenErrorFace;
    private ExitToken tokenNotThere;

    //Sensor
    private Sensor<FaceIdentificationList> faceSensor;
    private SpeechActuator speechActuator;

    //Slots
    private MemorySlot<PersonDataList> knownPersonsMemorySlot;
    private MemorySlot<String> nameSlot;
    private MemorySlot<String> faceIdSlot;
    private MemorySlot<PersonData> foundPersonSlot;
    private MemorySlot<String> heightSlot;
    private MemorySlot<FaceIdentificationList> faceIdentificationSlot;

    private PersonDataList knownPersonDataList;
    private PersonData person;
    private boolean skip = false;
    private long start = -1;
    FaceIdentification largestFace = null;
    FaceIdentification operatorsFace;
    FaceIdentificationList scanFaces;

    @Override
    public void configure(ISkillConfigurator configurator) {

        faceSensor = configurator.getSensor("FaceIdentificationSensor", FaceIdentificationList.class);
        speechActuator = configurator.getActuator("SpeechActuator", SpeechActuator.class);

        //Reads the datamodel of the state
        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, timeout);
        sayInfo = configurator.requestOptionalBool(KEY_SAY, sayInfo);
        known = configurator.requestOptionalBool(KEY_KNOWN, known);
        allFaces = configurator.requestOptionalBool(KEY_ALL, allFaces);
        name = configurator.requestOptionalBool(KEY_NAME, name);
        height = configurator.requestOptionalBool(KEY_HEIGHT, height);

        if (known) {
            knownPersonsMemorySlot = configurator.getSlot(
                    "KnownPersonsSlot", PersonDataList.class);
            foundPersonSlot = configurator.getSlot(
                    "PersonDataSlot", PersonData.class);
            faceIdentificationSlot = configurator.getSlot("FaceIdentificationSlot", FaceIdentificationList.class);
            if (name) {
                nameSlot = configurator.getSlot("PersonName", String.class);
            }
            if (height) {
                heightSlot = configurator.getSlot("FaceHeight", String.class);
            }
        } else {
            tokenErrorFace = configurator.requestExitToken(ExitStatus.ERROR().ps("falseId"));

            faceIdToSearch = configurator.requestOptionalInt(KEY_ID, Integer.MIN_VALUE);
            if (faceIdToSearch == Integer.MIN_VALUE) {
                faceIdSlot = configurator.getSlot("FaceIdSlot", String.class);
                //logger.fatal(ex);
                //throw new SkillConfigurationException(ex.getMessage());
            }
            if (name) {
                String msg = "cant save name if person is not known, set " + KEY_KNOWN + " to true";
                logger.warn(msg);
                throw new SkillConfigurationException(msg);
            }
        }

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenNotThere = configurator.requestExitToken(ExitStatus.SUCCESS().ps("NotThere"));

        if (timeout > 0) {
            tokenErrorTimeout = configurator.requestExitToken(ExitStatus.ERROR().ps("timeout"));
        } else {
            logger.warn("this skill should use a timeout!");
        }
    }

    @Override
    public boolean init() {

        // read list of known persons from memory
        if (known) {
            try {
                knownPersonDataList = knownPersonsMemorySlot.recall();
            } catch (CommunicationException ex) {
                logger.fatal("Exception while reading from personDataMemorySlot");
                return false;
            }
            if (knownPersonDataList == null || knownPersonDataList.isEmpty()) {
                logger.warn("no PersonDataList of known Persons in Memory found or empty");
                skip = true;
            }

        } else {
            if (faceIdToSearch == -1) {
                try {
                    faceIdToSearch = Integer.valueOf(faceIdSlot.recall());
                } catch (CommunicationException ex) {
                    logger.fatal("Exception while reading from faceIdSlot");
                    return false;
                }
            }
            logger.debug("idToSearch  is " + faceIdToSearch);
        }

        this.start = Time.currentTimeMillis();

        return true;
    }

    @Override
    public ExitToken execute() {
        if (timeout > 0) {
            if (start + timeout < Time.currentTimeMillis()) {
                logger.debug("timeout");
                return tokenErrorTimeout;
            }
        }

        if (faceIdToSearch < 0 && !known) {
            logger.error("has no or corrupt faceId: " + faceIdToSearch);
            return tokenErrorFace; //todo: fix this
        }

        // read faces   
        try {
            scanFaces = faceSensor.readLast(1000);
            if (scanFaces == null || scanFaces.size() == 0) {
                throw new IOException();
            }
        } catch (IOException | InterruptedException e) {
            logger.error("got no data from face sensor");
            return ExitToken.loop(TIME_TO_SLEEP);
        }
        logger.debug("faceSensor has returned " + scanFaces.size() + " faces!");

        if (allFaces) {
            return allFaces(scanFaces);
        } else {
            return largestFace(scanFaces);
        }

    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            try {
                if (known) {
                    foundPersonSlot.memorize(person);
                    if (name) {
                        nameSlot.memorize(person.getName());
                    }
                    // memorize regionHeight of largest Face in slot
                    if (height && !allFaces) {
                        String faceRegionHeight = String.valueOf(largestFace.getRegionHeight());
                        heightSlot.memorize(faceRegionHeight);
                    }
                    if (allFaces) {
                        //FaceIdentificationList fIList = new FaceIdentificationList();
                        //fIList.addIdentification(operatorsFace);
                        faceIdentificationSlot.memorize(scanFaces);
                    }
                }
            } catch (CommunicationException ex) {
                Logger.getLogger(SearchForFace.class.getName()).log(Level.SEVERE, null, ex);
            }
        } else {
            if (!skip && !allFaces && largestFace != null) {
                //sayInfo(largestFace); TODO check if right
                return tokenNotThere;
            }
        }

        return curToken;

    }

    private ExitToken largestFace(FaceIdentificationList list) {
        // find largest face

        double maxFaceSize = 0;
        for (FaceIdentificationList.FaceIdentification face : list) {
            double size = face.getRegionWidth() * face.getRegionHeight();
            if (largestFace == null || size > maxFaceSize) {
                largestFace = face;
                maxFaceSize = size;
            }
        }

        if (largestFace == null || largestFace.getClassId() < 0) {
            return ExitToken.loop(TIME_TO_SLEEP);
        }

        if (skip) {
            sayInfo(largestFace);
            return ExitToken.fatal();
        }

        logger.debug("face id is " + largestFace.getClassId());
        // find  face
        if (known) {
            for (PersonData p : knownPersonDataList) {
                faceIdToSearch = p.getFaceId();
                if (largestFace.getClassId() == faceIdToSearch) {
                    person = p;
                    sayInfo(largestFace);
                    return tokenSuccess;
                }
            }
        } else {
            if (largestFace.getClassId() == faceIdToSearch) {
                return tokenSuccess;
            }
        }
        return ExitToken.loop(TIME_TO_SLEEP);

    }

    private ExitToken allFaces(FaceIdentificationList list) {

        if (skip) {
            return ExitToken.fatal();
        }

        // find  face
        if (known) {
            for (PersonData p : knownPersonDataList) {
                faceIdToSearch = p.getFaceId();
                logger.debug("Searched FaceID from PersonData:" + faceIdToSearch);
                for (FaceIdentificationList.FaceIdentification face : list) {
                    if (face.getClassId() == faceIdToSearch) {
                        person = p;
                        sayInfo(face);
                        operatorsFace = face;
                        return tokenSuccess;
                    }
                }

            }
        } else {
            for (FaceIdentificationList.FaceIdentification face : list) {
                if (face.getClassId() == faceIdToSearch) {
                    sayInfo(face);
                    operatorsFace = face;
                    return tokenSuccess;
                }
            }
        }

        return ExitToken.loop(TIME_TO_SLEEP);
    }

    private void sayInfo(FaceIdentificationList.FaceIdentification targetFace) {
        if (sayInfo) {
            String txt = "i guess you are " + targetFace.getGender();
            try {
                speechActuator.say(txt);
            } catch (IOException ex) {
                logger.error("IO Exception in speechActuator");
            }

            txt = " and about " + targetFace.getAgeFrom()
                    + " to " + targetFace.getAgeTo() + " years old";
            try {
                speechActuator.say(txt);
            } catch (IOException ex) {
                logger.error("IO Exception in speechActuator");
            }

        }
    }

}*/
