package de.unibi.citec.clf.bonsai.skills.knowledge;

import de.unibi.citec.clf.bonsai.actuators.deprecated.KBaseActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.btl.data.geometry.Point2D;
import de.unibi.citec.clf.btl.data.geometry.PrecisePolygon;
import de.unibi.citec.clf.btl.data.knowledgebase.Location;
import de.unibi.citec.clf.btl.data.knowledgebase.Room;
import de.unibi.citec.clf.btl.data.map.Annotation;
import de.unibi.citec.clf.btl.data.map.Viewpoint;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.units.LengthUnit;

import java.util.LinkedList;

/**
 * Stores a given robot position in the knowledge base. It will be saved as a
 * Location.
 * <pre>
 *
 * Options:
 *  #_NAME:         [String] Optional (default: "")
 *                      -> Name of viewpoint to be stored
 *  #_LOCATION      [String] Optional (default: "saved location")
 *                      -> Name of the location the vp is stored under
 * 
 * Slots:
 *  PositionDataSlot: [PositionData] [Read]
 *      -> Memory slot with position to store
 *  ViewpointNameSlot: [String] [Read]
 *      -> Memory slot with name the Location should be stored under only used if option #_NAME is not given
 *
 * ExitTokens:
 *  success:    Position saved successfully
 *  error:      Position could not be saved correctly
 *
 * Sensors:
 *
 * Actuators:
 *  KBaseActuator: [KBaseActuator]
 *      -> Called save the Location
 *
 *
 * </pre>
 *
 * @author rfeldhans
 */
public class StoreLocation extends AbstractSkill {

    private static final String KEY_NAME = "#_NAME";
    private static final String KEY_ANAME = "#_LOCATION";

    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private MemorySlotReader<PositionData> positionSlot;
    private MemorySlotReader<String> nameSlot;

    private KBaseActuator kBaseActuator;

    private PositionData posData;
    private Location location;
    private String viewpointName = "";
    private String locationName = "saved location";

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
        positionSlot = configurator.getReadSlot("PositionDataSlot", PositionData.class);

        locationName = configurator.requestOptionalValue(KEY_ANAME, locationName);
        locationName = locationName.toLowerCase();

        if (configurator.hasConfigurationKey(KEY_NAME)) {
            viewpointName = configurator.requestValue(KEY_NAME);
        } else {
            logger.info("no viewpoint name given, using slot");
            nameSlot = configurator.getReadSlot("ViewpointNameSlot", String.class);
        }

        kBaseActuator = configurator.getActuator("KBaseActuator", KBaseActuator.class);

    }

    @Override
    public boolean init() {
        try {
            posData = positionSlot.recall();

            if (posData == null) {
                logger.error("your PositionDataSlot was empty");
                return false;
            }

        } catch (CommunicationException ex) {
            logger.fatal("Unable to read from memory: ", ex);
            return false;
        }
        try {
            if (nameSlot != null) {
                viewpointName = nameSlot.recall();
            }

            if (viewpointName == null) {
                logger.error("your LocationNameSlot was empty");
                return false;
            }

        } catch (CommunicationException ex) {
            logger.fatal("Unable to read from memory: ", ex);
            return false;
        }

        for (Location loc : kBaseActuator.getArena().getLocations()) {
            if(loc.getName().equals(locationName)) {
                location = loc;
                break;
            }
        }

        Viewpoint vp = new Viewpoint(posData);
        vp.setLabel(viewpointName);


        if(location == null ) {
            // create location, or rather necessary stuff for the location
            LinkedList<Viewpoint> vps = new LinkedList<>();
            vps.add(vp);

            Annotation annot = new Annotation();
            annot.setPolygon(createArea(posData));
            annot.setLabel("unimportant");
            annot.setViewpoints(vps);

            location = new Location();
            location.setAnnotation(annot);
            location.setIsBeacon(true);
            location.setIsPlacement(false);
            location.setName(locationName);
        } else {
            LinkedList<Viewpoint> vps = location.getAnnotation().getViewpoints();
            for (int i = 0; i < vps.size(); i++) {
                if (vps.get(i).getLabel().equals(viewpointName)) {
                    vps.remove(i);
                    break;
                }
            }
            vps.add(vp);
        }

        return true;
    }

    @Override
    public ExitToken execute() {

        if(location.getRoom() == null) {
            Room room = null;
            try {
                Point2D position = new Point2D(posData);
                room = kBaseActuator.getRoomForPoint(position);
            } catch (KBaseActuator.BDONotFoundException e) {
                logger.error("Shall never ever occur: " + e.getMessage());
            } catch (KBaseActuator.NoAreaFoundException e) {
                logger.error("Given Position , lets just hope the knowledgebase has a room named outside or is good at error handling. " + e.getMessage());
            }

            if (room == null) {
                location.setRoom("arena");
            } else {
                location.setRoom(room.getName());
            }

        }

        try {
            kBaseActuator.storeBDO(location);
        } catch (KBaseActuator.BDOHasInvalidAttributesException e) {
            logger.error("KBase had a problem with storing the location in the default room, known as \"outside\"");
            return tokenError;
        }
        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }

    private PrecisePolygon createArea(PositionData positionData) {
        PrecisePolygon precisePolygon = new PrecisePolygon();
        // add 8 Points, each equidistant from each other and 1m from positionData to the Polygon
        int amountPoints = 8;
        for (int i = 0; i < amountPoints; i++) {
            Point2D p = new Point2D();
            double angle = 2 * Math.PI * i / amountPoints;

            p.setX(positionData.getX(LengthUnit.METER) + Math.sin(angle), LengthUnit.METER);
            p.setY(positionData.getY(LengthUnit.METER) + Math.cos(angle), LengthUnit.METER);

            precisePolygon.addPoint(p);
        }
        return precisePolygon;
    }
}
