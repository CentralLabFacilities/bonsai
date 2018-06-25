package de.unibi.citec.clf.bonsai.skills.knowledge;


import de.unibi.citec.clf.bonsai.actuators.KBaseActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.navigation.PositionData;

/**
 * This Skill is used for retrieving the room the robot is currently in.
 * <pre>
 *
 * Options:
 *
 * Slots:
 *  LocationNameSlot: [String] [Write]
 *      -> Memory slot the name of the location will be writen to
 *  PositionDataSlot: [PositionData] [Read]
 *      -> Memory slot with the position the location of should be retrieved from
 *
 * ExitTokens:
 *  success:                Name of the Location successfully retrieved
 *  error.NoLocation:       The position did not lie in any Location
 *  error:                  Name of the Location could not be retrieved
 *
 * Sensors:
 *
 * Actuators:
 *  KBaseActuator: [KBaseActuator]
 *      -> Called to retrieve the Location
 *
 *
 * </pre>
 *
 * @author rfeldhans
 */
public class GetLocation extends AbstractSkill {

    private ExitToken tokenSuccess;
    private ExitToken tokenErrorNoLocation;
    private ExitToken tokenError;

    private MemorySlotWriter<String> locationSlot;
    private MemorySlotReader<PositionData> positionDataSlot;

    private KBaseActuator kBaseActuator;

    private String locationName;
    private PositionData positionData;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenErrorNoLocation = configurator.requestExitToken(ExitStatus.ERROR().ps("noLocation"));
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        locationSlot = configurator.getWriteSlot("LocationNameSlot", String.class);
        positionDataSlot = configurator.getReadSlot("PositionDataSlot", PositionData.class);

        kBaseActuator = configurator.getActuator("KBaseActuator", KBaseActuator.class);
    }

    @Override
    public boolean init() {
        try {
            positionData = positionDataSlot.recall();

            if (positionData == null) {
                logger.error("your PositionDataSlot was empty");
                return false;
            }

        } catch (CommunicationException ex) {
            logger.fatal("Unable to read from memory: ", ex);
            return false;
        }

        return true;

    }

    @Override
    public ExitToken execute() {
        try {
            locationName = kBaseActuator.getLocationForPoint(positionData).getName();
        } catch (KBaseActuator.BDONotFoundException e) {
            logger.fatal("Should never ever occur.");
            e.printStackTrace();
            return ExitToken.fatal();
        } catch (KBaseActuator.NoAreaFoundException e) {
            logger.debug("Position was in no location.");
            return tokenErrorNoLocation;
        }

        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            try {
                locationSlot.memorize(locationName);
            } catch (CommunicationException ex) {
                logger.error("Could not memorize locationName");
                return tokenError;
            }
        }
        return curToken;
    }

}
