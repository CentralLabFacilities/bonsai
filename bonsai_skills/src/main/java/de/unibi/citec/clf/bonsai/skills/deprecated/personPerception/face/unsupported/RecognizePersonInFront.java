package de.unibi.citec.clf.bonsai.skills.deprecated.personPerception.face.unsupported;


import de.unibi.citec.clf.bonsai.actuators.SpeechActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;

import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.person.PersonData;
import java.io.IOException;
import java.util.Date;

/**
 * In this state the robot tries to recognize the person standing in front of
 * him.
 *
 * @author lruegeme
 */
public class RecognizePersonInFront extends AbstractSkill {

    //constants
    private static final int TIME_TO_SLEEP = 500;

    // used tokens
    private ExitToken tokenError;
    private ExitToken tokenSuccessRecognized;
    private ExitToken tokenSuccessUnknown;

    //Actuator
    private SpeechActuator speechActuator;

    //Sensors
    //private Sensor<FaceIdentificationList> faceSensor;

    //Slots
    private MemorySlot<List<PersonData>> knownPersonsMemorySlot;

    private List<PersonData> knownPersonDataList;
    private PersonData foundPerson;

    private Date start = Time.now();

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        tokenSuccessRecognized = configurator.requestExitToken(ExitStatus.SUCCESS().ps("known"));
        tokenSuccessUnknown = configurator.requestExitToken(ExitStatus.SUCCESS().ps("unknown"));

        knownPersonsMemorySlot = configurator.getSlot(
                "KnownPersonsSlot", List.getListClass(PersonData.class));

        //faceSensor = configurator.getSensor("FaceIdentificationSensor", FaceIdentificationList.class);
        speechActuator = configurator.getActuator(
                "SpeechActuator", SpeechActuator.class);

    }

    @Override
    public boolean init() {
        // read list of known persons from memory
        try {
            knownPersonDataList = knownPersonsMemorySlot.recall();
        } catch (CommunicationException ex) {
            logger.fatal("Exception while reading from personDataMemorySlot");
            return false;
        }

        if (knownPersonDataList == null || knownPersonDataList.isEmpty()) {
            logger.warn("no PersonDataList of known Persons in Memory found or empty");
            return false;
        }

        return true;
    }

    @Override
    public ExitToken execute() {
/*
        // read faces
        FaceIdentificationList list;
        try {
            list = faceSensor.readLast(1000);
            if (list == null || list.size() == 0) {
                throw new IOException();
            }
        } catch (IOException | InterruptedException e) {
            logger.error("got no data from face sensor");
            return tokenError;
        }

        // find largest face
        FaceIdentificationList.FaceIdentification largestFace = null;
        double maxFaceSize = 0;
        for (FaceIdentificationList.FaceIdentification face : list) {
            double size = face.getRegionWidth() * face.getRegionHeight();
            if (largestFace == null || size > maxFaceSize) {
                largestFace = face;
                maxFaceSize = size;
            }
        }

        // check if face has valid ID
        if (largestFace == null || largestFace.getClassId() < 0) {
            logger.error("largest face has illegal ID. Retry !!!");
            return ExitToken.loop(TIME_TO_SLEEP);
        }

        foundPerson = getPersonByFaceID(largestFace.getClassId());

*/
        if (foundPerson != null) {
            return tokenSuccessRecognized;
        } else {
            return tokenSuccessUnknown;
        }
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            if (foundPerson != null) {
                say("You are " + foundPerson.getName());
            } else {
                say("i dont know you");
            }
        }
        return curToken;

    }

    private PersonData getPersonByFaceID(final int faceId) {
        for (int i = 0; i < knownPersonDataList.size(); i++) {

            /*if (knownPersonDataList.get(i).getFaceId() == faceId) {
                return knownPersonDataList.get(i);
            }*/
        }

        logger.debug("Person with id " + faceId + " unknown. Known persons:");
        for (int i = 0; i < knownPersonDataList.size(); i++) {
            logger.debug("  Name: " + knownPersonDataList.get(i).getName());
            /*
            logger.debug("  Faceid: " + knownPersonDataList.get(i).getFaceId());
            */
        }
        logger.debug("done");
        return null;
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

}
