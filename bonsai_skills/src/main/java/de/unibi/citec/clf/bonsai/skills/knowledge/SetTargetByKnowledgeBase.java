package de.unibi.citec.clf.bonsai.skills.knowledge;

import de.unibi.citec.clf.bonsai.actuators.KBaseActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.btl.data.map.Viewpoint;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;

/**
 * Writes a Viewpoint from the knowledgebase into memory.
 * <pre>
 *
 * Options:
 *  #_USE_SPECIFIC_VIEWPOINT:   [boolean] Optional (default: "false")
 *                                  -> Whether or not to use a specific viewpoint
 *  #_LOCATION:                 [String] Optional (default: "")
 *                                  -> Name of location to drive to
 *  #_VIEWPOINT:                [String] Optional (default: "")
 *                                  -> Name of viewpoint to drive to. Only if #_USE_SPECIFIC_VIEWPOINT is true
 *  #_USE_SLOT:                 [boolean] Optional (default: true)
 *                                  -> Whether to read location and viewpoint name from memeory. Set to false to use #_LOCATION and #_VIEWPOINT.
 *
 *
 * Slots:
 *  LocationNameSlot: [String] [Read]
 *      -> Memory slot to read the name of a specific location
 *  ViewpointNameSlot: [String] [Read], optional
 *      -> Memory slot to read the name of a specific viewpoint. Only needed when #_USE_SPECIFIC_VIEWPOINT is true
 *  NavigationGoalDataSlot: [NavigationGoalData] [Write]
 *      -> Memory slot to store the target
 *
 * ExitTokens:
 *  success:                Target set successfully
 *  error.noSuchLocation:   location is unknown to the knowledgebase
 *
 * Sensors:
 *
 * Actuators:
 *  KBaseActuator: [KBaseActuator]
 *      -> Called to retrieve the NavigationGoal
 *
 *
 * </pre>
 *
 * @author rfeldhans
 */
public class SetTargetByKnowledgeBase extends AbstractSkill {

    private static final String KEY_USE_SPECIFIC_VIEWPOINT = "#_USE_SPECIFIC_VIEWPOINT";
    private static final String KEY_LOCATION = "#_LOCATION";
    private static final String KEY_VIEWPOINT = "#_VIEWPOINT";
    private static final String KEY_SLOT = "#_USE_SLOT";

    private boolean useSpecificViewpoint = false;
    private boolean useSlot = true;

    private ExitToken tokenSuccess;
    private ExitToken tokenErrorNoSuchLocation;

    private MemorySlotReader<String> locationNameSlot;
    private MemorySlotReader<String> viewpointNameSlot;
    private MemorySlotWriter<NavigationGoalData> navigationGoalDataSlot;

    private KBaseActuator kBaseActuator;

    private NavigationGoalData navigationGoalData;
    private String locationName = "";
    private String viewpointName = "main";

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {

        useSpecificViewpoint = configurator.requestOptionalBool(KEY_USE_SPECIFIC_VIEWPOINT, useSpecificViewpoint);
        logger.debug("############ requested use specific viewpoint " + useSpecificViewpoint);

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenErrorNoSuchLocation = configurator.requestExitToken(ExitStatus.ERROR().ps("NoSuchLocation"));

        navigationGoalDataSlot = configurator.getWriteSlot("NavigationGoalDataSlot", NavigationGoalData.class);

        useSlot = configurator.requestOptionalBool(KEY_SLOT, useSlot);
        locationName = configurator.requestOptionalValue(KEY_LOCATION, locationName);
        viewpointName = configurator.requestOptionalValue(KEY_VIEWPOINT, viewpointName);

        if (useSlot) {
            logger.debug("############ configurating location slot");
            locationNameSlot = configurator.getReadSlot("LocationNameSlot", String.class);
            if (useSpecificViewpoint) {
                logger.debug("############ configurating viewpoint slot");
                viewpointNameSlot = configurator.getReadSlot("ViewpointNameSlot", String.class);
            }
        }

        kBaseActuator = configurator.getActuator("KBaseActuator", KBaseActuator.class);

    }

    @Override
    public boolean init() {
        try {
            if (useSlot) {
                logger.debug("################################ using slots to retrieve location name");
                locationName = locationNameSlot.recall();
            }

            if (locationName == null) {
                logger.error("your LocationNameSlot was empty");
                return false;
            } else {
                logger.debug("## recalled location slot " + locationName);
            }

        } catch (CommunicationException ex) {
            logger.fatal("Unable to read from memory: ", ex);
            return false;
        }
        if (useSpecificViewpoint) {
            logger.debug("################################ using specific viewpoint");
            try {
                if (useSlot) {
                    logger.debug("################################ using slots to retrieve viewpoint name");
                    viewpointName = viewpointNameSlot.recall();
                }

                if (viewpointName == null) {
                    logger.error("your ViewpointNameSlot was empty");
                    return false;
                } else {
                    logger.debug("## recalled viewpoint slot " + locationName);
                }

            } catch (CommunicationException ex) {
                logger.fatal("Unable to read from memory: ", ex);
                return false;
            }
        }

        logger.debug("initialized locationName: " + locationName);
        logger.debug("initialized viewpointName: " + viewpointName);
        return true;
    }

    @Override
    public ExitToken execute() {
        Viewpoint viewpoint;
        try {
            viewpoint = kBaseActuator.getViewpoint(locationName, viewpointName);
        } catch (KBaseActuator.BDONotFoundException e) {
            logger.error("Did not find a Location with name " + locationName);
            return tokenErrorNoSuchLocation;
        } catch (KBaseActuator.NoAreaFoundException e) {
            logger.error("Shall never ever occur: " + e.getMessage());
            return ExitToken.fatal();
        }
        navigationGoalData = new NavigationGoalData(viewpoint);

        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.getExitStatus().isSuccess()) {
            if (navigationGoalData != null) {
                try {
                    navigationGoalDataSlot.memorize(navigationGoalData);
                } catch (CommunicationException ex) {
                    logger.fatal("Unable to write to memory: " + ex.getMessage());
                    return ExitToken.fatal();
                }
            }
        }
        return curToken;
    }

}
