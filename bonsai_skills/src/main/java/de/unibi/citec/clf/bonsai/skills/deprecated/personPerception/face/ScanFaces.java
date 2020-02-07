package de.unibi.citec.clf.bonsai.skills.deprecated.personPerception.face;

/**
 * In this state, the robot scans all seen faces of a given minimal size and saves it into Memory slot.
 *
 * @author climberg
 */
/*public class ScanFaces extends AbstractSkill {
 unsupported
    //defaults
    private int timeoutS = 20;
    private double minFaceRegionHeight = 0;
    private double minFaceSize = 0;
    private double largestFaceRegionHeight = 0;
    private boolean height = false;
    private double heightThreshold = 0.5;
    private boolean saveImage = false;

    //Datamodel Keys
    private static final String KEY_HEIGHT = "#_USEHEIGHT";
    private static final String KEY_THRESHOLD = "#_TRESHOLD";
    private static final String KEY_SAVEIMAGE = "#_SAVEIMAGE";

    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenSuccessTimeout;
    private ExitToken tokenError;

    //Sensors
    private Sensor<FaceIdentificationList> faceSensor;
    private Sensor<ImageData> imageSensor;

    //MemorySlots
    private MemorySlot<FaceIdentificationList> knownFacesMemorySlot;
    private MemorySlot<FaceIdentificationList> scanpeople;
    private MemorySlot<String> heightSlot;
    private MemorySlot<ImageData> imageDataSlot;

    FaceIdentificationList pIdList;
    FaceIdentificationList scanList;
    FaceIdentificationList recognizedFaces;
    ImageData image;

    long millisStart;

    @Override
    public void configure(ISkillConfigurator configurator) {

        //Reads the datamodel of the state
        height = configurator.requestOptionalBool(KEY_HEIGHT, height);
        heightThreshold = configurator.requestOptionalDouble(KEY_THRESHOLD, heightThreshold);
        saveImage = configurator.requestOptionalBool(KEY_SAVEIMAGE, saveImage);

        faceSensor = configurator.getSensor(
                "FaceIdentificationSensor", FaceIdentificationList.class);

        if (saveImage) {
            imageSensor = configurator.getSensor("ImageDataSensor", ImageData.class);
        }

        knownFacesMemorySlot = configurator.getSlot(                "FaceIdentificationListSlot", FaceIdentificationList.class);

        scanpeople = configurator.getSlot("ScanedPeopleSlot", FaceIdentificationList.class);
        if (saveImage) {
            imageDataSlot = configurator.getSlot("ImageDataSlot", ImageData.class);
        }

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        tokenSuccessTimeout = configurator.requestExitToken(ExitStatus.SUCCESS().ps("timeout"));

        if (height) {
            heightSlot = configurator.getSlot("FaceHeight", String.class);
        }

    }

    @Override
    public boolean init() {

        if (height) {
            try {
                largestFaceRegionHeight = Double.valueOf(heightSlot.recall());
            } catch (CommunicationException ex) {
                logger.fatal("Exception while reading from heightSlot");
            }
        }

        try {
            pIdList = knownFacesMemorySlot.recall();
        } catch (CommunicationException ex) {
            logger.fatal("Exception while reading from knownFacesMemorySlot");
            return false;
        }

        if (pIdList == null) {
            logger.debug("FaceIdentificationList was empty, so new List was created!");
            pIdList = new FaceIdentificationList();
        }

        try {
            scanList = scanpeople.recall();
        } catch (CommunicationException ex) {
            Logger.getLogger(ScanFaces.class.getName()).log(Level.SEVERE, null, ex);
        }
        if (scanList == null) {
            scanList = new FaceIdentificationList();
            logger.debug("ScanList was empty, so new List was created!");
        }

        return true;
    }

    @Override
    public ExitToken execute() {
        millisStart = Time.currentTimeMillis();
        boolean redo = true;
        boolean skip = false;
        FaceIdentificationList list = null;
        recognizedFaces = new FaceIdentificationList();
        //debug dummy to test behaviour, if id recognition isnt able to set id of a person
        //FaceIdentification dummy = new FaceIdentification();
        //dummy.setClassId(-1);dummy.setRegionHeight(50);dummy.setRegionWidth(50);dummy.setRegionX(300);dummy.setRegionY(300);
        //dummy.setGender(FaceIdentification.Gender.UNKNOWN);
        logger.debug("Enter scan people");
        while (redo && !skip) {
            //if timeout is over, return tokenSuccess
            if (millisStart + timeoutS * 1000 < Time.currentTimeMillis()) {
                logger.debug("timeout scanface procedure! Add all Faces with Id == -1");
                skip = true;
            }
            redo = false;
            try {
                list = faceSensor.readLast(100);
                if (saveImage) {
                    image = imageSensor.readLast(100);
                }
                if ((list == null || list.size() == 0) && !skip) {
                    redo = true;
                    logger.debug("scanPeople list is null or empty, redo scan process!");
                    continue;
                }
                //logger.debug("added dummy with id = -1");
                //list.addIdentification(dummy);
            } catch (IOException | InterruptedException e) {
                logger.debug("faceSensor read exception, redo scan process!");
                redo = true;
            }
            for (FaceIdentificationList.FaceIdentification face : list) {
                if (face.getClassId() != -1) {//TODO: think about this. may be completely unneccessary
                    recognizedFaces.addIdentification(face);
                }
                if (skip && face.getClassId() == -1) {
                    recognizedFaces.addIdentification(face);
                    logger.debug("Add Face with Id == -1");
                }
                if (face.getClassId() == -1) {
                    logger.debug("scanPeople had undefined faceid, redo scan process!");
                    redo = true;

                } else {
                    logger.debug("scanPeople detected Face" + face.getClassId());
                    logger.debug(face.toString());
                }
            }
        }
        /*
        logger.debug("Enter Filtering the Crowd. Not realised yet.");
        if (height) {
            minFaceRegionHeight = heightThreshold * largestFaceRegionHeight;
        }
        // find  face
        for (FaceIdentificationList.FaceIdentification face : recognizedFaces) {
            if (height && face.getRegionHeight() >= this.minFaceRegionHeight && !pIdList.hasFace(face) && face.getClassId() != -1) {
                
                pIdList.addIdentification(face);
                
                scanList.addIdentification(face);
                logger.debug("add person " + face.getClassId() + " with gender "+face.gender+" to list");
            }
            //person wasnt seen yet and is put into pidlist
            if (!height && face.height >= this.minFaceSize && !pIdList.hasFace(face) && face.getClassId() != -1) {
                pIdList.addIdentification(face);
                
                scanList.addIdentification(face);
                logger.debug("add person " + face.getClassId() + " with gender "+face.gender+" to list");
                //say("add person " + p.faceId + " to list");

                //TODO: Report: if the person is known, update regionX, regionY, regionHeight and regionWidth!
            } else {
                logger.debug("person with id " + face.getClassId() + " was already in list or is corrupted");
                //say("person with id " + face.getClassId() + " was already in list");
            }

        } * /
        logger.debug("Leave scan people");

        if (skip) {
            return tokenSuccessTimeout;
        } else {
            return tokenSuccess;
        }
    }

    @Override
    public ExitToken end(ExitToken curToken) {

        //if(curToken == tokenSuccess) {
        try {
            scanpeople.memorize(recognizedFaces); //scanList
        } catch (CommunicationException ex) {
            Logger.getLogger(ScanFaces.class.getName()).log(Level.SEVERE, null, ex);
        }
        try {
            knownFacesMemorySlot.memorize(pIdList);
        } catch (CommunicationException ex) {
            logger.fatal("Couldn't safe faceList to Memory Slot");
            return tokenError;
        }
        try {
            if (saveImage) {
                imageDataSlot.memorize(image);
            }
        } catch (CommunicationException ex) {
            Logger.getLogger(ScanFaces.class.getName()).log(Level.SEVERE, null, ex);
        }
        //}

        return curToken;

    }

}*/
