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

import java.util.Collections;
import java.util.LinkedList;
import java.util.List;
import java.util.concurrent.ExecutionException;

/**
 * This Skill is used to filter a List of Persons by one or more specific attributes.
 * These Attributes can be any of the Attributes found in PersonAttribute, i.e. gesture, posture, gender, shirtcolor
 * and age. They are read via Slots (see below). Multiple values can be given, if the e.g. gestures are seperatet by
 * semicolons (";")
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
                String[] gestureArray = gestureString.split(";");
                logger.debug("Gesture slot was not null. Filtering by gestures from slot");
                for (String ges : gestureArray) {

                    if (ges.length() == 1 && Character.isDigit(ges.charAt(0))) {
                        if (PersonAttribute.Gesture.fromInteger(Integer.parseInt(ges)) == null) {
                            logger.warn("Gesture \"" + ges + "\" not defined.");
                            continue;
                        }
                        logger.info("Searching for gesture: "+PersonAttribute.Gesture.fromInteger(Integer.parseInt(ges)));
                        gesture.add(PersonAttribute.Gesture.fromInteger(Integer.parseInt(ges)));
                    } else {
                        if (PersonAttribute.Gesture.fromString(ges) == null) {
                            logger.warn("Gesture \"" + ges + "\" not defined.");
                            continue;
                        }
                        logger.info("Searching for gesture: "+PersonAttribute.Gesture.fromString(ges));
                        gesture.add(PersonAttribute.Gesture.fromString(ges));
                    }
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
                logger.debug("Posture slot was not null. Filtering by postures from slot");
                String[] postureArray = postureString.split(";");
                for (String pos : postureArray) {

                    if (pos.length() == 1 && Character.isDigit(pos.charAt(0))) {
                        if (PersonAttribute.Posture.fromInteger(Integer.parseInt(pos)) == null) {
                            logger.warn("Posture " + pos + " not defined.");
                            continue;
                        }
                        logger.info("Searching for posture: "+PersonAttribute.Posture.fromInteger(Integer.parseInt(pos)));
                        posture.add(PersonAttribute.Posture.fromInteger(Integer.parseInt(pos)));
                    } else {
                        if (PersonAttribute.Posture.fromString(pos) == null) {
                            logger.warn("Posture " + pos + " not defined.");
                            continue;
                        }
                        logger.info("Searching for posture: "+PersonAttribute.Posture.fromString(pos));
                        posture.add(PersonAttribute.Posture.fromString(pos));
                    }
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
                for (String gend : genderString.split(";")) {
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
                for (String shirtc : shirtcolorString.split(";")) {
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
                logger.info("your AgeSlot was empty, defaulting to 0-200");
                ageFrom = 0;
                ageTo = 200;
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
            //FETCHING PERSON ATTZIBUTE
            PersonAttribute att = person.getPersonAttribute();

            if(att != null){
                person.setPersonAttribute(att);
                try {
                    att.getAgeFrom();
                    att.getAgeTo();
                } catch (NumberFormatException e) {
                    att.setAge("0-200");
                    logger.debug("got no age info, using 0-200 instead to not miss anybody", e);
                }
                logger.debug("attributes of current person");
                logger.debug("got name " + person.getName());
                logger.debug("got gestures " + att.getGestures());
                logger.debug("got posture " + att.getPosture());
                logger.debug("got gender " + att.getGender());
                logger.debug("got shirt " + att.getShirtcolor());
                logger.debug("got age " + att.getAgeFrom() + " " + att.getAgeTo());
                if (!gesture.isEmpty() && Collections.disjoint(gesture, att.getGestures())) {
                    logger.debug("Gesture check failed!");
                    continue;
                }
                if (!posture.isEmpty() && !posture.contains(att.getPosture())) {
                    logger.debug("Posture check failed!");
                    continue;
                }
                if (!gender.isEmpty() && !gender.contains(att.getGender())) {
                    logger.debug("Gender check failed!");
                    continue;
                }
                if (!shirtcolor.isEmpty() && !shirtcolor.contains(att.getShirtcolor())) {
                    logger.debug("Shirt color check failed!");
                    continue;
                }
                try {
                    if (att.getAgeFrom() > ageTo || att.getAgeTo() < ageFrom) {
                        logger.debug("Age check failed!");
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
