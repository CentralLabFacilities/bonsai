package de.unibi.citec.clf.bonsai.skills.personPerception;

import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;
import de.unibi.citec.clf.btl.units.LengthUnit;

/**
 * Identifies the nearest person from a list of persons and saves it to memory.
 *
 * <pre>
 *
 * Slots:
 *  PersonDataListSlot:             [PersonDataList] [Read]
 *      -> All found persons in a list
 *  PositionSlot:                   [Position] [Read]
 *      -> the robot position to calculate relative distance.
 *  PersonDataSlot:             [PersonData] [Write]
 *      -> The nearest person
 *
 * ExitTokens:
 *  success:         The nearest Person has been written to memory.
 *  error:           The nearest Person has not been written to memory.
 *
 * </pre>
 *
 * @author pvonneumanncosel
 */
public class SelectNearestPerson extends AbstractSkill {

    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private MemorySlotReader<PersonDataList> personDataListSlot;
    private MemorySlotReader<PositionData> positionDataSlot;
    private MemorySlotWriter<PersonData> personDataSlot;

    private PersonDataList personDataList;
    private PositionData positionData;
    private PersonData bestPerson;

    @Override
    public void configure(ISkillConfigurator configurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        personDataListSlot = configurator.getReadSlot("PersonDataListSlot", PersonDataList.class);
        positionDataSlot = configurator.getReadSlot("PositionDataSlot", PositionData.class);

        personDataSlot = configurator.getWriteSlot("PersonDataSlot", PersonData.class);
    }

    @Override
    public boolean init() {
        try {
            personDataList = personDataListSlot.recall();

            if (personDataList == null) {
                logger.error("your PersonDataListSlot was empty");
                return false;
            }
        } catch (CommunicationException ex) {
            logger.error("Unable to read from memory: " + ex.getMessage());
            return false;
        }
        try {
            positionData = positionDataSlot.recall();

            if (positionData == null) {
                logger.error("your PositionDataSlot was empty");
                return false;
            }
            if (Double.isNaN(positionData.getX(LengthUnit.METER)) || Double.isNaN(positionData.getY(LengthUnit.METER))) {
                logger.error("your PositionDataSlot was NaN");
                return false;
            }
        } catch (CommunicationException ex) {
            logger.error("Unable to read from memory: " + ex.getMessage());
            return false;
        }
        return true;
    }

    @Override
    public ExitToken execute() {
        double bestDist = Integer.MAX_VALUE;
        bestPerson = null;

        for (PersonData currentPerson : personDataList) {

            double distance = positionData.getDistance(currentPerson.getPosition(), LengthUnit.MILLIMETER);

            if (distance > bestDist) {
                logger.debug("dropping person, because i already found closer person");
                continue;
            }

            bestDist = distance;
            bestPerson = currentPerson;
        }

        if (bestPerson == null) {
            return tokenError;
        }
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            if (bestPerson != null) {
                try {
                    personDataSlot.memorize(bestPerson);
                } catch (CommunicationException ex) {
                    logger.fatal("Unable to write to memory: " + ex.getMessage());
                    return tokenError;
                }
            }
        }
        return curToken;
    }
}
