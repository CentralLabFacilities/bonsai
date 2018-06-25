package de.unibi.citec.clf.bonsai.skills.deprecated.personPerception;

import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.helper.PersonHelper;
import java.io.IOException;

/**
 * In this state the robot tries to recognize, when a person lying in front of him, stands up.
 *
 * @author climber
 *//*
public class DetectAwakening extends AbstractSkill {

    private static final String KEY_NUM_FRAMES_DETECTED = "#_NUM_FRAMES_DETECTED";
    private static final String KEY_MAX_FACE_DISTANCE = "#_MAX_FACE_DISTANCE";

    //defaults
    private int minFrames = 3; //num frames of detecting for sending success
    private double maxDist = Double.MAX_VALUE;

    private static final int TIME_TO_SLEEP = 200;

    // used tokens
    private ExitToken tokenSuccess;

    //Sensors
    private Sensor<FaceIdentificationList> faceSensor;

    //private ArrayList<Integer> ids = new ArrayList<Integer>();
    private int numFaces = 0;
    private boolean detected = false;
    private int detectedNumFaces = 0;
    private int detectedFrame = 0;

    @Override
    public void configure(ISkillConfigurator configurator) {

        faceSensor = configurator.getSensor("FaceIdentificationSensor", FaceIdentificationList.class);

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        maxDist = configurator.requestOptionalDouble(KEY_MAX_FACE_DISTANCE, maxDist);
        minFrames = configurator.requestOptionalInt(KEY_NUM_FRAMES_DETECTED, minFrames);

    }

    @Override
    public boolean init() {
        // read faces
        FaceIdentificationList list;
        try {
            list = faceSensor.readLast(10);
            if (list == null) {
                throw new IOException();
            }
        } catch (IOException | InterruptedException e) {
            logger.error("got no data from face sensor");
            return true;
        }

        //set number of faces to initial state
        this.numFaces = list.size();

        return true;
    }

    @Override
    public ExitToken execute() {

        // read faces
        FaceIdentificationList list;
        try {
            list = faceSensor.readLast(20);
            if (list == null) {
                throw new IOException();
            }
        } catch (IOException | InterruptedException e) {
            logger.error("got no data from face sensor");
            return ExitToken.loop(TIME_TO_SLEEP);
        }

        //clear faces that are too small
        FaceIdentificationList cleanedList = new FaceIdentificationList();
        for (FaceIdentificationList.FaceIdentification face : list) {
            double faceDist = PersonHelper.guessDistanceToFace(face);
            if (faceDist <= maxDist) {
                cleanedList.addIdentification(face);
                logger.debug("added face to cleanedList: dist " + faceDist);
            } else {
                logger.debug("throw away face: dist " + faceDist);
            }
        }

        int lastNumFaces = numFaces;

        logger.debug("numFaces: " + numFaces);

        numFaces = cleanedList.size();

        if (!detected) {
            if (numFaces > lastNumFaces) {
                detected = true;
                detectedFrame = 1;
                detectedNumFaces = numFaces;
            }
        } else { //detected
            if (numFaces < detectedNumFaces) { //face disappeared and detectedFaceCount < NUM_FRAMES_DETECT
                detected = false;
                logger.debug("loosing face! " + minFrames + " are reqired to detect, but only " + detectedFrame + " were detected in a row. numFaces: " + numFaces + " detectedNumFaces: " + detectedNumFaces);

            } else {
                ++detectedFrame;
                if (detectedFrame >= minFrames) {
                    logger.debug("received new face for " + minFrames + " in a row, so the patient must be woken up");
                    return tokenSuccess;
                }
            }

        }

        return ExitToken.loop(TIME_TO_SLEEP);

    }

    @Override
    public ExitToken end(ExitToken curToken) {

        return curToken;

    }
}
        */
