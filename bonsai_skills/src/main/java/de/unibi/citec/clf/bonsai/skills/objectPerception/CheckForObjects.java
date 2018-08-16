package de.unibi.citec.clf.bonsai.skills.objectPerception;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.object.ObjectShapeData;
import de.unibi.citec.clf.btl.data.object.ObjectShapeList;

import java.util.ArrayList;

/**
 * Checks if a set of certain objects was recognized and generates reports.
 * <pre>
 *
 * Options:
 *
 * Slots:
 *  ObjectNameSlot: [String] [Read]
 *      -> Memory slot the object labels will be read from. Multiple labels have to be separated by semi-colons (;)
 *  ObjectShapeListSlot: [ObjectShapeList] [Read]
 *      -> Memory slot the object shapes will be read from (output of RecognizeObjects skill)
 *
 *  FoundObjectsSlot: [String] [Write]
 *      -> Memory Slot where the found objects will be stored in (separated by semi-colons)
 *  MissingObjectsSlot: [String] [Write]
 *      -> Memory Slot where the not-found objects will be stored in (separated by semi-colons)
 *  FoundReportSlot: [String] [Write]
 *      -> Memory Slot where the report string for found objects will be stored in. (String format: "object1, object2 and object3")
 *
 *
 * ExitTokens:
 *  success:                Successfully checked detected objects.
 *  fatal:                  probably write to slot errors
 *
 * Sensors:
 *
 * Actuators:
 *
 *
 * </pre>
 *
 * @author dleins
 */
public class CheckForObjects extends AbstractSkill {

    public enum Number
    {
        ZERO(0, "zero"),
        ONE(1, "one"),
        TWO(2, "two"),
        THREE(3, "three"),
        FOUR(4, "four"),
        FIVE(5, "five");

        private final int value;
        private final String name;

        Number(int value, String name) {
            this.value = value;
            this.name = name;
        }
    }

    private ExitToken tokenSuccess;
    private ExitToken tokenSuccessNoMissing;
    private ExitToken tokenError;

    String objectNames;

    List<ObjectShapeData> objectList;

    private static final String KEY_NAMES = "#_NAMES";

    private MemorySlotReader<ObjectShapeList> objectsRecognizedSlot;
    private MemorySlotReader<String> objectNameSlot;
    private MemorySlotWriter<String> foundObjectsSlot;
    private MemorySlotWriter<String> missingObjectsSlot;
    private MemorySlotWriter<String> foundReportSlot;
    private MemorySlotWriter<String> missingReportSlot;

    private String foundList;
    private String missingList;
    private String foundReport;
    private String missingReport;

    private String[] names;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenSuccessNoMissing = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("noMissing"));
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        objectNames = configurator.requestOptionalValue(KEY_NAMES, objectNames);

        objectsRecognizedSlot = configurator.getReadSlot("ObjectShapeListSlot", ObjectShapeList.class);
        //objectNameSlot = configurator.getReadSlot("ObjectNameSlot", String.class);

        foundObjectsSlot = configurator.getWriteSlot("FoundObjectsSlot", String.class);
        missingObjectsSlot = configurator.getWriteSlot("MissingObjectsSlot", String.class);
        foundReportSlot = configurator.getWriteSlot("FoundReportSlot", String.class);
        missingReportSlot = configurator.getWriteSlot("MissingReportSlot", String.class);
    }

    @Override
    public boolean init() {
        //objectNames = objectNameSlot.recall();
        objectNames = objectNames.replace("\t", "");
        objectNames = objectNames.replace("\n", "");
        objectNames = objectNames.trim().replaceAll("\\s{2,}", " ");
        logger.info("replaced string: "+objectNames);
        names = objectNames.split(";");
        try {
            objectList = objectsRecognizedSlot.recall();
        } catch (CommunicationException ex) {
            logger.error("CommunicationException while recalling recognized objects slot: " + ex.getMessage());
        }
        return true;
    }

    @Override
    public ExitToken execute() {

        if (names.length < 1) {
            return tokenError;
        }

        int objAmount = objectList.size();

        int[] amount = new int[names.length];

        for (int i = 0; i < names.length; i++) {
            for (ObjectShapeData object : objectList) {
                if (object.getBestLabel().equals(names[i])) {
                    amount[i]++;
                }
            }
        }

        StringBuffer missRep = new StringBuffer();
        StringBuffer hitRep = new StringBuffer();

        StringBuffer miss = new StringBuffer();
        StringBuffer hit = new StringBuffer();

        ArrayList<String> missingArrayList = new ArrayList<>();

        for (int i = 0; i < amount.length; i++) {
            if (amount[i] > 0) {

                String amountName = Number.values()[amount[i]].name;

                for (int j = 0; j < amount[i]; j++) {
                    hit.append(names[i]+";");
                }

                if (objAmount < objectList.size() && objAmount-amount[i] > 0) {
                    hitRep.append(", "+amountName+" "+names[i]+" ");
                } else if (i > 0 && objAmount-amount[i] < 0) {
                    hitRep.append(", "+amountName+" "+names[i]+" ");
                } else {
                    hitRep.append(amountName+" "+names[i]);
                }
                objAmount -= amount[i];
            } else {
                missingArrayList.add(names[i]);
            }
        }

        for (int i = 0; i < missingArrayList.size(); i++) {
            missRep.append(missingArrayList.get(i));
            if (i < missingArrayList.size()-2) {
                missRep.append(", ");
            } else if (i == missingArrayList.size()-2) {
                missRep.append(" and ");
            }
            miss.append(missingArrayList.get(i)+";");
        }

        foundReport = hitRep.toString();
        missingReport = missRep.toString();

        foundList = hit.toString();
        missingList = miss.toString();

        logger.info("Found objects: "+foundReport);
        logger.info("Missing objects: "+missingReport);

        if (missingArrayList.size() == 0) {
            return tokenSuccessNoMissing;
        }

        if (missingArrayList.size() == names.length) {
            foundReport = "no drinks at all";
        }

        return tokenSuccess;
    }
        /*
     * write results to location defined in objectsRecognizedMemoryActuator.
     * 
     * @see de.unibi.citec.clf.bonsai.engine.abstractskills.AbstractSkill#end()
     */
    @Override
    public ExitToken end(ExitToken curToken) {

        if (curToken.equals(tokenSuccess)) {
            try {
                foundReportSlot.memorize(foundReport);
                missingReportSlot.memorize(missingReport);

                foundObjectsSlot.memorize(foundList);
                missingObjectsSlot.memorize(missingList);
            } catch (CommunicationException ex) {
                logger.error("Could not save to slots");
            }
        }
        return tokenSuccess;

    }
}
