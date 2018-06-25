package de.unibi.citec.clf.bonsai.skills.personPerception;

import de.unibi.citec.clf.bonsai.actuators.GetPersonAttributesActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.btl.data.person.PersonAttribute;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;

import java.util.LinkedList;
import java.util.List;
import java.util.concurrent.ExecutionException;

/**
 * This Skill is used to filter a List of Persons by one or more specific attributes.
 * These Attributes can be any of the Attributes found in PersonAttribute, i.e. gesture, posture, gender, shirtcolor
 * and age. They are read via Slots (see below). Multiple values can be given, if the e.g. gestures are seperatet by
 * colons (":")
 * <pre>
 *
 * Options:
 *
 * Slots:
 *  PersonDataListReadSlot: [PersonDataList] [Read]
 *      -> Memory slot the unfiltered list of persons will be read from
 *  PersonDataListWriteSlot: [PersonDataList] [Write]
 *      -> Memory slot the filtered list of persons will be written to
 *
 *  GestureSlot: [String] [Read]
 *      -> Memory Slot for the Gesture by that shall be filtered
 *  PostureSlot: [String] [Read]
 *      -> Memory Slot for the Posture by that shall be filtered
 *  GenderSlot: [String] [Read]
 *      -> Memory Slot for the Gender by that shall be filtered
 *  ShirtcolorSlot: [String] [Read]
 *      -> Memory Slot for the Shirtcolor by that shall be filtered
 *  AgeSlot: [String] [Read]
 *      -> Memory Slot for the Age by that shall be filtered
 *
 *
 * ExitTokens:
 *  success:                List successfully filtered, at least one PersonData remaining
 *  success.noPeople        List successfully filtered, but no Person remaining/ List empty
 *  error:                  Name of the Location could not be retrieved
 *
 * Sensors:
 *
 * Actuators:
 *
 *
 * </pre>
 *
 * @author rfeldhans
 */
public class FilterPeople extends AbstractSkill {
    private ExitToken tokenSuccess;
    private ExitToken tokenSuccessNoPeople;
    private ExitToken tokenError;

    private MemorySlotReader<PersonDataList> personDataReadSlot;
    private MemorySlotWriter<PersonDataList> personDataWriteSlot;
    private MemorySlotReader<String> gestureSlot;
    private MemorySlotReader<String> postureSlot;
    private MemorySlotReader<String> genderSlot;
    private MemorySlotReader<String> shirtcolorSlot;
    private MemorySlotReader<String> ageSlot;

    private GetPersonAttributesActuator attributeActuator;

    private PersonDataList personDataList;
    private List<PersonAttribute.Gesture> gesture = new LinkedList<>();
    private List<PersonAttribute.Posture> posture = new LinkedList<>();
    private List<PersonAttribute.Gender> gender = new LinkedList<>();
    private List<PersonAttribute.Shirtcolor> shirtcolor = new LinkedList<>();
    private int ageFrom;
    private int ageTo;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenSuccessNoPeople = configurator.requestExitToken(ExitStatus.SUCCESS().ps("noPeople"));
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        attributeActuator = configurator.getActuator("GetPersonAttributesActuator", GetPersonAttributesActuator.class);

        personDataReadSlot = configurator.getReadSlot("PersonDataListReadSlot", PersonDataList.class);
        personDataWriteSlot = configurator.getWriteSlot("PersonDataListWriteSlot", PersonDataList.class);
        gestureSlot = configurator.getReadSlot("GestureSlot", String.class);
        postureSlot = configurator.getReadSlot("PostureSlot", String.class);
        genderSlot = configurator.getReadSlot("GenderSlot", String.class);
        shirtcolorSlot = configurator.getReadSlot("ShirtcolorSlot", String.class);
        ageSlot = configurator.getReadSlot("AgeSlot", String.class);
    }

    @Override
    public boolean init() {
        try {
            personDataList = personDataReadSlot.recall();

            if (personDataList == null) {
                logger.error("your PersonDataListReadSlot was empty");
                return false;
            }

        } catch (CommunicationException ex) {
            logger.fatal("Unable to read from memory: ", ex);
            return false;
        }
        String gestureString = "";
        String postureString = "";
        String genderString = "";
        String shirtcolorString = "";
        String ageString = "";
        try {
            gestureString = gestureSlot.recall();

            if (gestureString == null || gestureString.isEmpty()) {
                logger.info("your GestureSlot was empty, will not filter by gesture");
            } else {
                logger.info("will filter by gestures: " + gestureString);
                for (String gest : gestureString.split(":")) {
                    gesture.add(PersonAttribute.Gesture.fromString(gest));
                }
            }

        } catch (CommunicationException ex) {
            logger.fatal("Unable to read from memory: ", ex);
            return false;
        } catch (RuntimeException ex) {
            logger.fatal("Gesture name\"" + gestureString + "\" was not allowed, will not filter by it");
        }
        try {
            postureString = postureSlot.recall();

            if (postureString == null || postureString.isEmpty()) {
                logger.info("your PostureSlot was empty, will not filter by posture");
            } else {
                logger.info("will filter by postures: " + postureString);
                for (String post : postureString.split(":")) {
                    posture.add(PersonAttribute.Posture.fromString(post));
                }
            }

        } catch (CommunicationException ex) {
            logger.fatal("Unable to read from memory: ", ex);
            return false;
        } catch (RuntimeException ex) {
            logger.fatal("Posture name\"" + postureString + "\" was not allowed, will not filter by it");
        }
        try {
            genderString = genderSlot.recall();

            if (genderString == null || genderString.isEmpty()) {
                logger.info("your GenderSlot was empty, will not filter by gender");
            } else {
                logger.info("will filter by genders: " + genderString);
                for (String gend : genderString.split(":")) {
                    gender.add(PersonAttribute.Gender.fromString(gend));
                }
            }

        } catch (CommunicationException ex) {
            logger.fatal("Unable to read from memory: ", ex);
            return false;
        } catch (RuntimeException ex) {
            logger.fatal("Gender name\"" + genderString + "\" was not allowed, will not filter by it");
        }
        try {
            shirtcolorString = shirtcolorSlot.recall();

            if (shirtcolorString == null || shirtcolorString.isEmpty()) {
                logger.info("your ShirtcolorSlot was empty, will not filter by shircolor");
            } else {
                logger.info("will filter by shirtcolors: " + shirtcolorString);
                for (String shirtc : shirtcolorString.split(":")) {
                    shirtcolor.add(PersonAttribute.Shirtcolor.fromString(shirtc));
                }
            }

        } catch (CommunicationException ex) {
            logger.fatal("Unable to read from memory: ", ex);
            return false;
        } catch (RuntimeException ex) {
            logger.fatal("Shirtcolor name\"" + shirtcolorString + "\" was not allowed, will not filter by it");
        }
        try {
            ageString = ageSlot.recall();

            if (ageString == null || ageString.isEmpty()) {
                logger.info("your AgeSlot was empty, will not filter by age");
                ageFrom = Integer.MIN_VALUE;
                ageTo = Integer.MAX_VALUE;
            } else if (ageString.contains("-")) {
                ageFrom = Integer.parseInt(ageString.split("-")[0]);
                ageTo = Integer.parseInt(ageString.split("-")[1]);
            } else {
                ageFrom = ageTo = Integer.parseInt(ageString);
            }
            logger.info("will filter by age: " + ageFrom + "-" + ageTo);

        } catch (CommunicationException ex) {
            logger.fatal("Unable to read from memory: ", ex);
            return false;
        }
        return true;
    }

    @Override
    public ExitToken execute() {
        PersonDataList filteredPersons = new PersonDataList();
        for (PersonData person : personDataList) {
            PersonAttribute att = null;
            try {
                att = attributeActuator.getPersonAttributes(person.getUuid());
            } catch (InterruptedException e) {
                logger.fatal("get person att call was interupted ", e);
            } catch (ExecutionException e) {
                logger.fatal("get person att exec execption: ", e);
            }
            if(att != null){
                person.setPersonAttribute(att);
                try {
                    ageFrom = att.getAgeFrom();
                    ageTo = att.getAgeTo();
                } catch (NumberFormatException e) {
                    att.setAge("0-200");
                    logger.debug("got no age info, using 0-200 instead to not miss anybody", e);
                }
                logger.debug("attributes of current person");
                logger.debug("got gesture " + att.getGesture());
                logger.debug("got posture " + att.getPosture());
                logger.debug("got gender " + att.getGender());
                logger.debug("got shirt " + att.getShirtcolor());
                logger.debug("got age " + att.getAgeFrom() + " " + att.getAgeTo());
                if (!gesture.isEmpty() && !gesture.contains(att.getGesture())) {
                    continue;
                }
                if (!posture.isEmpty() && !posture.contains(att.getPosture())) {
                    continue;
                }
                if (!gender.isEmpty() && !gender.contains(att.getGender())) {
                    continue;
                }
                if (!shirtcolor.isEmpty() && !shirtcolor.contains(att.getShirtcolor())) {
                    continue;
                }
                try {
                    if (att.getAgeFrom() > ageTo || att.getAgeTo() < ageFrom) {
                        continue;
                    }
                } catch (NumberFormatException ex) {
                    logger.error("Got an NumberFormatException: " + ex.getMessage());
                }
                filteredPersons.add(person);
                logger.debug("###### PERSON GOT THROUGH FILTER ##########");
            }
        }
        personDataList = filteredPersons;
        if (personDataList.isEmpty()) {
            return tokenSuccessNoPeople;
        }
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            try {
                personDataWriteSlot.memorize(personDataList);
            } catch (CommunicationException ex) {
                logger.error("Could not memorize personDataList");
                return tokenError;
            }
        }
        return curToken;
    }
}
