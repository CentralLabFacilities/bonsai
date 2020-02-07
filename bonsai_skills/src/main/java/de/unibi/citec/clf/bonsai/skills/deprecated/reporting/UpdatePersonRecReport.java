package de.unibi.citec.clf.bonsai.skills.deprecated.reporting;

/**
 * TODO
 *
 * @author dsixt
 */
/*
public class UpdatePersonRecReport extends AbstractSkill {
    // used tokens
    private ExitToken tokenSuccess;
    private ExitToken tokenError;
    private ExitToken tokenSuccessPartly;

    private static final String KEY_OPERATOR = "#_REPORT_OPERATOR";
    private static final String KEY_THRESHOLDWIDTH = "#_IMAGEWIDTH";
    private static final String KEY_THRESHOLDHEIGHT = "#_IMAGEHEIGHT";
    private static final String KEY_XTHRESHOLDSPACE = "#_XPIXEL";
    private static final String KEY_YTHRESHOLDSPACE = "#_YPIXEL";

    private String FILENAME;
    private String PATH;
    private String filenameTex;
    private int faceIdToSearch = -1;
    private boolean reportOperator = false;

    private String clImage = "/tmp/personRec.ppm";
    private String conImage = "/tmp/personRec.png";

    private int xfreeSpace = 50;
    private int yfreeSpace = 50;
    private int thresholdWidth = 640;
    private int thresholdHeight = 480;

    private String pose;

    //private static final org.apache.log4j.Logger LOGGER = org.apache.log4j.Logger.getLogger(WritePositionToMap.class);
    /**
     * Variables from SCXML file.
     * /
    private MemorySlot<String> faceIdSlot;
    private MemorySlot<String> filenameSlot;
    private MemorySlot<String> pathSlot;
    private MemorySlot<String> poseSlot;
    private MemorySlot<String> thresholdSlot;

    private int threshold = 2;

    private MemorySlot<FaceIdentificationList> scanpeople;
    private MemorySlot<FaceIdentificationList> scanOperatorFaces;
    private MemorySlot<ImageData> imageDataSlot;

    FaceIdentificationList scanList;
    FaceIdentificationList operatorFaces;
    FaceIdentificationList iteratorList;

    private ImageData testImage;
    private String datum;
    private DateFormat dateFormat;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        tokenSuccessPartly = configurator.requestExitToken(ExitStatus.SUCCESS().ps("partly"));
        pathSlot = configurator.getSlot("pathSlot", String.class);
        filenameSlot = configurator.getSlot("filenameSlot", String.class);
        faceIdSlot = configurator.getSlot("FaceIdSlot", String.class);
        scanpeople = configurator.getSlot("ScanedPeopleSlot", FaceIdentificationList.class);
        scanOperatorFaces = configurator.getSlot("ScanOperatorSlot", FaceIdentificationList.class);
        imageDataSlot = configurator.getSlot("ImageDataSlot", ImageData.class);
        poseSlot = configurator.getSlot("PoseSlot", String.class);
        thresholdSlot = configurator.getSlot("ThresholdSlot", String.class);

        reportOperator = configurator.requestOptionalBool(KEY_OPERATOR, reportOperator);
        xfreeSpace = configurator.requestOptionalInt(KEY_XTHRESHOLDSPACE, xfreeSpace);
        yfreeSpace = configurator.requestOptionalInt(KEY_YTHRESHOLDSPACE, yfreeSpace);
        thresholdHeight = configurator.requestOptionalInt(KEY_THRESHOLDHEIGHT, thresholdHeight);
        thresholdWidth = configurator.requestOptionalInt(KEY_THRESHOLDWIDTH, thresholdWidth);

    }

    @Override
    public boolean init() {

        try {
            dateFormat = new SimpleDateFormat("dd-MM-yyyy_kk-mm"); // Format für 24-Stunden-Anzeige
            datum = dateFormat.format(new Date());
            if (reportOperator) {
                operatorFaces = scanOperatorFaces.recall();
                clImage = "/tmp/Team_Tobi_PersonRecReport_" + datum + "_rgb_operator.ppm";
                conImage = "/tmp/Team_Tobi_PersonRecReport_" + datum + "_rgb_operator.png";
            } else {
                clImage = "/tmp/Team_Tobi_PersonRecReport_" + datum + "_rgb_crowd.ppm";
                conImage = "/tmp/Team_Tobi_PersonRecReport_" + datum + "_rgb_crowd.png";
                scanList = scanpeople.recall();
                if (faceIdSlot.recall() != null) {
                    faceIdToSearch = Integer.valueOf(faceIdSlot.recall());
                }
                if (thresholdSlot.recall() != null) {
                    threshold = Integer.valueOf(thresholdSlot.recall());
                }
            }
            testImage = imageDataSlot.recall();
            FILENAME = filenameSlot.recall();
            PATH = pathSlot.recall();
        } catch (CommunicationException ex) {
            logger.error("exception", ex);
            return false;
        }
        try {
            pose = poseSlot.recall();
        } catch (CommunicationException ex) {
            pose = "standing";
            logger.debug("No pose in MemorySlot. Set pose to 'standing'.");
        }
        logger.debug("USBPath is: " + PATH);

        return true;
    }

    @Override
    public ExitToken execute() {
        try {
            logger.debug("reading image now");
            testImage.writeImage(new File(clImage));
            PdfWriter.systemExecute("convert " + clImage + " " + conImage, true);
        } catch (Exception ex) {
            logger.debug("write image failed");
            ex.printStackTrace();
            return ExitToken.fatal();
        }

        if (PATH.equals(null)) {
            logger.fatal("Path was null. Maybe the report was not prepared?");
            return ExitToken.fatal();
        }

        filenameTex = PATH + FILENAME;

        if (!Files.exists(Paths.get(conImage))) {
            logger.error("Image was not found! Exiting");
            return ExitToken.fatal();
        }

        if (scanList == null && operatorFaces == null) {
            logger.debug("No persons were found, printing only the image to PDF!");
            PdfWriter.addImage(filenameTex, conImage);
            PdfWriter.createPDFFile(filenameTex, PATH);
            return tokenSuccessPartly;

        }
        return reportCrowd();
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }

    public ExitToken reportCrowd() {
        List<Polygon> polygonList = new ArrayList<>();
        if (reportOperator) {
            PdfWriter.writeTitleInFile(filenameTex, "This image shows the operator:");
            iteratorList = operatorFaces;
        } else {
            PdfWriter.writeTitleInFile(filenameTex, "This image shows the crowd:");
            iteratorList = scanList;
        }

        for (FaceIdentificationList.FaceIdentification face : iteratorList) {
            logger.debug("Added person " + face.getClassId() + ", x= " + face.getRegionX() + ", heightX= " + face.getRegionHeight() + ", y= " + face.getRegionY());
            Polygon poly = new Polygon(Color.blue);
            poly.addPoint(face.getRegionX(), face.getRegionY());
            poly.addPoint(face.getRegionX() + face.getRegionWidth(), face.getRegionY());
            poly.addPoint(face.getRegionX() + face.getRegionHeight(), face.getRegionY() + face.getRegionHeight());
            poly.addPoint(face.getRegionX(), face.getRegionY() + face.getRegionHeight());
            String label = face.getGender().toString();
            switch (label) {
                case "FEMALE":
                    poly.setColor(Color.red);
                    break;
                case "UNKNOWN":
                    poly.setColor(Color.black);
                    break;
            }
            if (reportOperator) {
                label = "Operator: " + label;
                poly.setColor(Color.green);
            }
            if (faceIdToSearch == face.getClassId()) {
                label = "Operator: " + pose;
                poly.setColor(Color.green);
            }
            poly.setLabel(label);
            polygonList.add(poly);
            logger.debug("TEXFILE WIRD AKTUALISIERT ==============");
        }
        if (!reportOperator) {
            Polygon newPoly = new Polygon(Color.black);
            newPoly.setLabel("threshold: " + threshold);
            newPoly.addPoint(1, threshold);
            newPoly.addPoint(1, threshold + 1);
            newPoly.addPoint(thresholdWidth - 1, threshold);
            newPoly.addPoint(thresholdWidth - 1, threshold + 1);
            //polygonList.add(newPoly);
            logger.debug("Height: " + thresholdHeight + ", Width: " + thresholdWidth);
            Polygon top = new Polygon(Color.black);
            top.setLabel("bb: " + xfreeSpace + " x " + yfreeSpace);
            top.addPoint(xfreeSpace, yfreeSpace);
            top.addPoint(xfreeSpace, thresholdHeight - yfreeSpace);
            top.addPoint(thresholdWidth - xfreeSpace, thresholdHeight - yfreeSpace);
            top.addPoint(thresholdWidth - xfreeSpace, yfreeSpace);
            //polygonList.add(top);
        }
        PdfWriter.addImageWithMultiplePolygon(filenameTex, conImage, polygonList, 1.0);
        if (!reportOperator) {
            PdfWriter.createPDFFile(filenameTex, PATH);
        }
        return tokenSuccess;
    }
}
        */
