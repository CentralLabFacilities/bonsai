package de.unibi.citec.clf.bonsai.skills.deprecated.personPerception.face;

import de.unibi.citec.clf.bonsai.actuators.FaceIdentificationHumavipsActuator;
import de.unibi.citec.clf.bonsai.actuators.SpeechActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.vision2d.ImageData;
import java.io.IOException;
import java.util.Date;

/**
 * This state will learn a new face.
 *
 * It starts starting timeout when person was facing robot once.
 *
 *
 *
 *
 * @author lruegeme
 */
public class LearnFace extends AbstractSkill {

    // keys
    private static final String KEY_SPEAK = "#_SPEAKHELP";
    private static final String KEY_STOREPERSON = "#_STOREPERSONS";
    private static final String KEY_INDEX = "#_PERSON_IDX";
    private static final String KEY_STORE_ID = "#_STORE_CLASS_ID";
    private static final String KEY_STOREFACE = "#_STOREFACES";
    private static final String KEY_SAVEIMAGE = "#_SAVEIMAGE";

    //defaults
    private boolean speakHelp = true;
    private int idx = -1;
    private boolean saveImage = false;

    // used tokens
    private ExitToken tokenSuccess;
    //private ExitToken tokenError;

    //Constants
    private static final int TIME_TO_SLEEP = 500;
    private static final String STATE_INTRO1 = "Please look into my upper camera ";
    private static final String STATE_INTRO3 = "I am learning your face now.";
    private static final String STATE_FINISHED = "Thank you!";

    //Actuator
    private SpeechActuator speechActuator;
    private FaceIdentificationHumavipsActuator faceActuator;

    //Sensor
    // unsupported private Sensor<FaceIdentificationList> faceSensor;
    private Sensor<ImageData> imageSensor;
    private MemorySlot<List<PersonData>> knownPersonsMemorySlot;
    // unsupported private MemorySlot<FaceIdentificationList> scanFaces;
    private MemorySlot<ImageData> imageDataSlot;
    private MemorySlot<String> classIdSlot;

    private List<PersonData> personDataList;
    private Date start = Time.now();

    private boolean assigned = false;
    private boolean storePersons;
    private boolean storeClass;
    private boolean storeFaces = false;
    // unsupported private FaceIdentificationList operators;

    @Override
    public void configure(ISkillConfigurator configurator) {
        speechActuator = configurator.getActuator("SpeechActuator", SpeechActuator.class);
        faceActuator = configurator.getActuator("FaceActuator", FaceIdentificationHumavipsActuator.class);
        // unsupported faceSensor = configurator.getSensor("FaceIdentificationSensor", FaceIdentificationList.class);

        storePersons = configurator.requestBool(KEY_STOREPERSON);
        speakHelp = configurator.requestOptionalBool(KEY_SPEAK, speakHelp);
        idx = configurator.requestOptionalInt(KEY_INDEX, idx);
        storeClass = configurator.requestBool(KEY_STORE_ID);
        storeFaces = configurator.requestOptionalBool(KEY_STOREFACE, storeFaces);
        saveImage = configurator.requestOptionalBool(KEY_SAVEIMAGE, saveImage);

        if (storePersons) {
            if (idx == -1) {
                logger.warn("KEY" + KEY_INDEX + " not found, assigning face to last person");
            }
            knownPersonsMemorySlot = configurator.getSlot("KnownPersonsSlot", List.getListClass(PersonData.class));
        }

        if (storeClass) {
            classIdSlot = configurator.getSlot("classIdSlot", String.class);
        }

        if (storeFaces) {
            // unsupported scanFaces = configurator.getSlot("ScanOperatorSlot", FaceIdentificationList.class);
            if (saveImage) {
                imageDataSlot = configurator.getSlot("ImageDataSlot", ImageData.class);
            }
        }

        if (!(storeClass || storePersons)) {
            String ex = "you have to store atleast one of: " + KEY_STOREPERSON + " , " + KEY_STORE_ID;
            logger.fatal(ex);
            throw new SkillConfigurationException(ex);
        }

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        //tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        if (saveImage) {
            imageSensor = configurator.getSensor("ImageDataSensor", ImageData.class);
        }

    }

    @Override
    public boolean init() {

        if (storePersons) {
            try {
                personDataList = knownPersonsMemorySlot.recall();
            } catch (CommunicationException ex) {
                logger.fatal(ex);
                return false;
            }
            if (personDataList == null || personDataList.isEmpty()) {
                logger.fatal("There was no person in the list");
                return false;
            }
            if (idx == -1) {
                idx = personDataList.size() - 1;
            }
            if (idx >= personDataList.size()) {
                logger.fatal("index out of personlist range");
                return false;
            }
        }

        if (speakHelp) {
            say(STATE_INTRO1, false);
        }
        start = Time.now();
        if (speakHelp) {
            say(STATE_INTRO3, true);
        }
        assigned = false;
        return true;
    }

    long forceIdTime;

    final int FORCE_TIME_MS = 1000;

    @Override
    public ExitToken execute() {

        // read faces
        //FaceIdentificationList list;
        ImageData image = null;
        /*try {
            list = faceSensor.readLast(300);
            if (saveImage) {
                image = imageSensor.readLast(50);
                if (image == null) {
                    throw new IOException();
                }
            }
            if (list == null || list.size() == 0) {
                throw new IOException();
            }
        } catch (IOException | InterruptedException e) {
            logger.error("got no data from face sensor");
            //return ExitToken.fatal();
            return ExitToken.loop(TIME_TO_SLEEP);
        }* /

        // find largest face
        FaceIdentificationList.FaceIdentification largestFace = null;
        double maxFaceSize = 0;
        /*for (FaceIdentificationList.FaceIdentification face : list) {
            double size = face.getRegionWidth() * face.getRegionHeight();
            if (largestFace == null || size > maxFaceSize) {
                largestFace = face;
                maxFaceSize = size;
            }
        }

        // check if face has valid ID
        if (largestFace == null || largestFace.getClassId() < 0) {
            logger.error("largest face with size " + maxFaceSize + " has illegal ID " + largestFace.getClassId() + ". Retry !!!");
            return ExitToken.loop(TIME_TO_SLEEP);
        }

        if (storePersons) {
            PersonData pers = personDataList.get(idx);
            logger.info("learning face for id: " + idx + " - pId: " + pers.getUuid() + " faceId is: " + largestFace.getClassId());
            pers.setFaceId(largestFace.getClassId());
            personDataList.updatePersonData(idx, pers);
        }* /

        try {
            if (storePersons) {
                logger.debug("knownPersonSlot: " + personDataList);
                knownPersonsMemorySlot.memorize(personDataList);
            }
            // will learn the operators face
            if (storeFaces) {
                /*
                operators = new FaceIdentificationList();
                operators.addIdentification(largestFace);
                scanFaces.memorize(operators);
                if (saveImage) {
                    imageDataSlot.memorize(image);
                }
            }
            if (storeClass) {

                String classId = String.valueOf(largestFace.getClassId());
                logger.debug("classID: " + classId);
                classIdSlot.memorize(classId);
            }
        } catch (CommunicationException e) {
            logger.error("Cannot communicate with memory: " + e.getMessage());
            logger.debug("Cannot communicate with memory: " + e.getMessage(), e);
            return ExitToken.fatal();
        }*/

        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curStatus) {
        // skip saying if you want to report the operators face
        if (speakHelp || !storeFaces) {
            say(STATE_FINISHED, true);
        }
        return curStatus;
    }

    /**
     * Use speech actuator to say something and catch IO exception.
     *
     * @param text Text to be said.
     * @param async if <code>true</code>, the method call will return as fast as possible, blocks otherwise
     */
    private void say(String text, boolean async) {
        try {
            if (async) {
                speechActuator.sayAsync(text);
            } else {
                speechActuator.say(text);
            }
        } catch (IOException ex) {
            // Not so bad. The robot just doesn't say anything.
            logger.warn(ex.getMessage());
        }
    }
}
