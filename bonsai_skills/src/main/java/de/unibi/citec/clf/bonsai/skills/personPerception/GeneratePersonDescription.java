package de.unibi.citec.clf.bonsai.skills.personPerception;

import de.unibi.citec.clf.bonsai.actuators.deprecated.KBaseActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.btl.data.geometry.Point2D;
import de.unibi.citec.clf.btl.data.person.PersonAttribute;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.units.LengthUnit;

/**
 * Generates a description based on persondata
 *
 * <pre>
 *
 * Options:
 *
 * Slots:
 *  PersonDataSlot:             [PersonDataSlot] [Read]
 *      -> person
 *  DescriptionSlot:                    [String] [Write]
 *      -> Generated description
 *
 * Sensors:
 *
 * ExitTokens:
 *  success           description generated successfully and saved to slot
 *
 * </pre>
 *
 * @author pvonneumancosel
 */

public class GeneratePersonDescription extends AbstractSkill {

    private ExitToken tokenSuccess;

    private MemorySlotReader<PersonData> personDataSlot;
    private MemorySlotWriter<String> descriptionSlot;

    private PersonData personData;
    private String description;

    private KBaseActuator kBaseActuator;

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());

        personDataSlot = configurator.getReadSlot("PersonDataSlot", PersonData.class);
        descriptionSlot = configurator.getWriteSlot("DescriptionSlot", String.class);

        kBaseActuator = configurator.getActuator("KBaseActuator", KBaseActuator.class);
    }

    @Override
    public boolean init() {
        try {
            personData = personDataSlot.recall();
        } catch (CommunicationException e) {
            logger.error("Error reading person slot");
            return false;
        }
        description = "";
        return true;
    }

    @Override
    public ExitToken execute() {
        StringBuffer sb = new StringBuffer();

        PersonAttribute.Shirtcolor shirtcolor = personData.getPersonAttribute().getShirtcolor();
        PersonAttribute.Posture posture = personData.getPersonAttribute().getPosture();
        PersonAttribute.Gesture gesture = personData.getPersonAttribute().getMostCharacteristicGesture();
        PersonAttribute.Gender gender = personData.getPersonAttribute().getGender();

        String ageString = "";
        if (personData.getPersonAttribute().getAge() != null && !personData.getPersonAttribute().getAge().equals("")) {

            int ageFrom;
            int ageTo;

            try {
                ageFrom = personData.getPersonAttribute().getAgeFrom();
                ageTo = personData.getPersonAttribute().getAgeTo();
            } catch (NumberFormatException e) {
                logger.debug("No from-to age format given; Got: "+personData.getPersonAttribute().getAge());
                ageFrom = Integer.parseInt(personData.getPersonAttribute().getAge());
                ageTo = ageFrom;
            }

            if (ageFrom < 20 && ageTo <= 15) {
                ageString = " adult ";
            } else if (ageFrom < 40 && ageTo <= 40) {
                ageString = " adult ";
            } else {
                ageString = " adult ";
            }
        }

        sb.append("The ");
        if(posture != null) {
            if (posture.getPostureName() != null) {
                sb.append(posture.getPostureName() + " ");
            }
        }

        if (ageString.equals(" child ")) {
            if (gender == PersonAttribute.Gender.UNKNOWN) {
                sb.append("child ");
            } else if (gender == PersonAttribute.Gender.FEMALE) {
                sb.append("girl ");
            } else {
                sb.append("boy ");
            }
            sb.append(ageString);
        } else {
            sb.append(ageString);
            if (gender == PersonAttribute.Gender.UNKNOWN) {
                sb.append("person ");
            } else if (gender == PersonAttribute.Gender.FEMALE) {
                sb.append("woman ");
            } else {
                sb.append("man ");
            }
        }

        if (shirtcolor != null) {
            sb.append("that is wearing a "+shirtcolor.getColorName()+" shirt");
        }

        if(gesture != null){
            if(gesture != PersonAttribute.Gesture.NEUTRAL)
            sb.append(" and " + gesture.getGestureName());
        }

        sb.append(".");

        Point2D locPoint = new Point2D(personData.getPosition().getX(LengthUnit.MILLIMETER),personData.getPosition().getY(LengthUnit.MILLIMETER),LengthUnit.MILLIMETER);
        if (kBaseActuator.getArena().getNearestLocation(locPoint) != null) {
            String locationName = kBaseActuator.getArena().getNearestLocation(locPoint).getName();
            if (gender == PersonAttribute.Gender.MALE) {
                sb.append(" You can find him near the ");
            } else {
                sb.append(" You can find her near the ");
            }
            sb.append(locationName);
            sb.append(".");
        }
        description = sb.toString();
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            try {
                descriptionSlot.memorize(description);
            } catch (CommunicationException e) {
                logger.error("Error while memorizing description");
                return ExitToken.fatal();
            }
        }
        return curToken;
    }
}
