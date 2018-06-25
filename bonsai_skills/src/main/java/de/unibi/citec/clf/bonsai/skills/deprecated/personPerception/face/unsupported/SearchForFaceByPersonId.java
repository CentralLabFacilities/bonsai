package de.unibi.citec.clf.bonsai.skills.deprecated.personPerception.face.unsupported;

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

/**
 * In this state the robot tries to recognize the person standing in front of him.
 *
 * @author lruegeme
 */
public class SearchForFaceByPersonId extends AbstractSkill {

    //defaults
    private int timeout = 10000;

    //constants
    private static final int TIME_TO_SLEEP = 500;

    //Datamodel Keys
    private static final String KEY_ID = "#_ID";
    private static final String KEY_TIMEOUT = "#_TIMEOUT";

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenTimeout;
    private ExitToken tokenSuccessNoPosition;

    //Sensors
    //private Sensor<FaceIdentificationList> faceSensor;
    private Sensor<List<PersonData>> personSensor;
    private Sensor<PositionData> positionSensor;

    //Slots
    private MemorySlot<List<PersonData>> knownPersonsMemorySlot;
    private MemorySlot<String> personIdSlot;
    private MemorySlot<NavigationGoalData> navigationGoalDataSlot;

    private List<PersonData> knownPersonDataList;

    private int idToSearch = -1;
    private int faceIdToSearch = -1;

    private long start = -1;

    @Override
    public void configure(ISkillConfigurator configurator) {
        knownPersonsMemorySlot = configurator.getSlot("personDataMemorySlot", List.getListClass(PersonData.class));
        navigationGoalDataSlot = configurator.getSlot("NavigationGoalDataSlot", NavigationGoalData.class);

        //faceSensor = configurator.getSensor("FaceIdentificationSensor", FaceIdentificationList.class);
        personSensor = configurator.getSensor("PersonSensor", List.getListClass(PersonData.class));
        positionSensor = configurator.getSensor("PositionSensor", PositionData.class);

        //Reads the datamodel of the state
        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, timeout);

        idToSearch = configurator.requestOptionalInt(KEY_ID, Integer.MIN_VALUE);
        if (idToSearch == Integer.MIN_VALUE) {
            personIdSlot = configurator.getSlot("personIdSlot", String.class);
            //logger.fatal(ex);
            //throw new SkillConfigurationException(ex.getMessage());
        }

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenSuccessNoPosition = configurator.requestExitToken(ExitStatus.SUCCESS().ps("noPosition"));
        if (timeout > 0) {
            tokenTimeout = configurator.requestExitToken(ExitStatus.SUCCESS().ps("timeout"));
        }
    }

    @Override
    public boolean init() {

        if (idToSearch == -1) {
            try {
                idToSearch = Integer.valueOf(personIdSlot.recall());
            } catch (CommunicationException ex) {
                logger.fatal("Exception while reading from faceIdSlot");
                return false;
            }

        }
        logger.debug("SearchForFaceByPersonId #### idToSearch (from Slot) is " + idToSearch);
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

        this.start = System.currentTimeMillis();

        return true;
    }

    @Override
    public ExitToken execute() {
        if (timeout > 0) {
            if (start + timeout < System.currentTimeMillis()) {
                logger.debug("SearchForFaceByPersonId #### timeout");
                return tokenTimeout;
            }

        }

        boolean found = false;
        for (PersonData p : knownPersonDataList) {
            /*if (p.getId() == idToSearch) {
                found = true;
                faceIdToSearch = p.getFaceId();
                logger.debug("SearchForFaceByPersonId #### person with id " + idToSearch + " was in knownPersonDataList!");
                break;
            } unsupported*/
        }

        if (!found) {
            logger.error("SearchForFaceByPersonId #### person with id: " + idToSearch + " not in knownPersonDataList ");
            return tokenSuccessNoPosition; //todo: fix this
        }

        if (faceIdToSearch < 0) {
            logger.error("SearchForFaceByPersonId #### person with id: " + idToSearch + " has no or corrupt faceId: " + faceIdToSearch);
            return tokenSuccessNoPosition; //todo: fix this
        }
/*
        // read faces
        FaceIdentificationList list;
        try {
            list = faceSensor.readLast(1000);
            if (list == null || list.size() == 0) {
                throw new IOException();
            }
        } catch (IOException | InterruptedException e) {
            logger.error("SearchForFaceByPersonId #### got no data from face sensor");
            return ExitToken.loop(TIME_TO_SLEEP);
        }
        logger.debug("SearchForFaceByPersonId #### faceSensor has returned " + list.size() + " faces!");

        // find  face
        for (FaceIdentificationList.FaceIdentification face : list) {
            if (face.getClassId() == faceIdToSearch) {
                logger.debug("SearchForFaceByPersonId #### returned tokenSuccessNoPosition!");

                return savePersonPosition();
            }
        }
*/
        return ExitToken.loop(TIME_TO_SLEEP);
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            return curToken;
        }

        return curToken;

    }

    public ExitToken savePersonPosition() {
        //TODO: return position of person!
        return tokenSuccessNoPosition;
        /*
         NavigationGoalData navGoal = null;
         //TODO get position of person
         logger.fatal("TODO get position of person");
        
         if (navGoal != null) {
         try {
         navigationGoalDataSlot.memorize(navGoal);
         logger.info("Stored navigation position of waving hand");
         } catch (CommunicationException ex) {
         logger.fatal("Could not memorize NavigationGoalData");
         return ExitToken.fatal();
         }
         }
        
         return tokenErrorNoPosition;
         */
    }

}
