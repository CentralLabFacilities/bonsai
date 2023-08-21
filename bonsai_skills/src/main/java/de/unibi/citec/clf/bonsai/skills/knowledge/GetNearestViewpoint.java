package de.unibi.citec.clf.bonsai.skills.knowledge;


import de.unibi.citec.clf.bonsai.actuators.deprecated.KBaseActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.knowledgebase.Arena;
import de.unibi.citec.clf.btl.data.navigation.PositionData;

/**
 * 
 * This Skill is used for getting the viewpoint which is nearest to the robot. It uses a euclidian distance approach.
 * <pre>
 *
 * Options:
 *
 * Slots:
 *  ViewpointNameSlot: [String] [Write]
 *      -> Memory slot the name of the location will be written to
 *  PositionDataSlot: [PositionData] [Read]
 *      -> Memory slot with the position the nearest location of should be retrieved from
 *
 * ExitTokens:
 *  success:                Name of the Location successfully retrieved
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
@Deprecated
public class GetNearestViewpoint extends AbstractSkill {

    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private MemorySlotWriter<String> viewpointSlot;
    private MemorySlotReader<PositionData> positionDataSlot;

    private KBaseActuator kBaseActuator;

    private String viewpointName;
    private PositionData positionData;
    
    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        viewpointSlot = configurator.getWriteSlot("ViewpointNameSlot", String.class);
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
        Arena arena = kBaseActuator.getArena();
        
        viewpointName = arena.getNearestViewpoint(positionData).getLabel();
        
        logger.info("Name of location: " + viewpointName);
        
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            try {
                viewpointSlot.memorize(viewpointName);
            } catch (CommunicationException ex) {
                logger.error("Could not memorize viewpointName");
                return tokenError;
            }
        }
        return curToken;
    }
}
