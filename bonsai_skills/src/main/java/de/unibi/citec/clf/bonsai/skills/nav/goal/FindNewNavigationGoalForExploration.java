package de.unibi.citec.clf.bonsai.skills.nav.goal;


import de.unibi.citec.clf.bonsai.actuators.NavigationActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotReader;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.geometry.Point2D;
import de.unibi.citec.clf.btl.data.geometry.PrecisePolygon;
import de.unibi.citec.clf.btl.data.navigation.GlobalPlan;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.vision2d.CameraAttributes;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;

import java.io.IOException;
import java.util.concurrent.*;


/**
 * WARNING: Momentarily non-functioning. Needs further implementations in PrecisePolygon (or should be moved completely to Nav)
 *
 * Generates a NavigationGoalData for the exploration of a area defined by a PrecisePolygon.
 * It takes into account the complete area as well as the already viewed area.
 * <pre>
 *
 * Options:
 *  #_PERCENTAGE_TO_CHECK: [double]
 *      -> Instead of exploring the complete room, a fraction to which the room shall be explored can be set.
 *  #_FOV_DEADZONE: [double]
 *      -> How much of the FoV should be ommitet at the sides. Useful e.g. so that people at the edge of the camera
 *      image are not overlooked. Specify this in rad.
 *  #_AMOUNT_OF_GENERATIONS: [int]
 *      -> Internally, n NavigationGoals are generated and the best ist choosen. Set n here. Please note that every
 *      point will result in at least one NavigationActuator Servicecall (slow).
 *  #_TIMEOUT           [long] Optional (default: -1)
 *                          -> Amount of time waited to understand something
 *
 * Slots:
 *  OriginalPolygonSlot: [PrecisePolygon] [Read]
 *      -> Memory slot to read the original Polygon
 *  ReducedPolygonSlot: [PrecisePolygon] [Read]
 *      -> Memory slot to read the already by the exploration reduced Polygon
 *  CurrentPositionSlot: [PositionData] [Read]
 *      -> MemorySlot of the current position (used to check if the generated Points are reachable)
 *  NavigationGoalDataSlot: [NavigationGoalData] [Write]
 *      -> Memory slot to store the target
 *
 * ExitTokens:
 *  success:                            Target set successfully
 *  success.PercentageToCheckReached:   The area has been explored to the specified percentage. No NavigationGoal has been set.
 *  error:                              Generating the NavigationGoal has failed.
 *
 * Sensors:
 *  CameraAttributesSensor [CameraAttributes]
 *      -> Used to retrieve the FoV of the RobotCamera
 *
 * Actuators:
 *  NavigationActuator [NavigationActuator]
 *      -> Used to retrieve if a generated point can be driven to
 *
 *
 * </pre>
 *
 * @author rfeldhans
 */
public class FindNewNavigationGoalForExploration extends AbstractSkill{

    private static final String KEY_PERCENTAGE_TO_CHECK = "#_PERCENTAGE_TO_CHECK";
    private static final String KEY_FOV_DEADZONE = "#_FOV_DEADZONE";
    private static final String KEY_AMOUNT_OF_GENERATIONS = "#_AMOUNT_OF_GENERATIONS";
    private static final String KEY_TIMEOUT = "#_TIMEOUT";

    private double percentageToCheck;
    private double fovDeadzone;
    private int amountOfGenerations;
    private long timeout = -1;

    private ExitToken tokenSuccess;
    private ExitToken tokenSuccessPercentageToCheckReached;
    private ExitToken tokenError;

    private MemorySlotReader<PrecisePolygon> originalPolygonSlot;
    private MemorySlotReader<PrecisePolygon> reducedPolygonSlot;
    private MemorySlotReader<PositionData> currentPositionSlot;
    private MemorySlotWriter<NavigationGoalData> navigationGoalDataSlot;

    private Sensor<CameraAttributes> cameraAttributesSensor;
    private NavigationActuator navigationActuator;

    private PrecisePolygon originalPolygon;
    private PrecisePolygon reducedPolygon;
    private PositionData currentPosition;
    private NavigationGoalData navigationGoalData = null;
    private CameraAttributes cameraAttributes;
    private List<PositionData> generatedPoints = new List<>(PositionData.class);
    private PositionData momentaryBestPoint;
    private double momentaryOverlap = 0.0;
    private boolean checkedRequiredPercentage = false;
    private Future<GlobalPlan> momentaryPlan = new Future<GlobalPlan>() {
        @Override
        public boolean cancel(boolean b) {
            return false;
        }
        @Override
        public boolean isCancelled() {
            return false;
        }
        @Override
        public boolean isDone() {
            return true;
        }
        @Override
        public GlobalPlan get() throws InterruptedException, ExecutionException {
            return null;
        }
        @Override
        public GlobalPlan get(long l, TimeUnit timeUnit) throws InterruptedException, ExecutionException, TimeoutException {
            return null;
        }
    };

    @Override
    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {

        percentageToCheck = configurator.requestOptionalDouble(KEY_PERCENTAGE_TO_CHECK, percentageToCheck);
        fovDeadzone = configurator.requestOptionalDouble(KEY_FOV_DEADZONE, fovDeadzone);
        amountOfGenerations = configurator.requestOptionalInt(KEY_AMOUNT_OF_GENERATIONS, amountOfGenerations);
        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, (int) timeout);

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenSuccessPercentageToCheckReached = configurator.requestExitToken(ExitStatus.SUCCESS().ps("PercentageToCheckReached"));
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        originalPolygonSlot = configurator.getReadSlot("OriginalPolygonSlot", PrecisePolygon.class);
        reducedPolygonSlot = configurator.getReadSlot("ReducedPolygonSlot", PrecisePolygon.class);
        currentPositionSlot = configurator.getReadSlot("CurrentPositionSlot", PositionData.class);
        navigationGoalDataSlot = configurator.getWriteSlot("NavigationGoalDataSlot", NavigationGoalData.class);

        cameraAttributesSensor = configurator.getSensor("CameraAttributesSensor", CameraAttributes.class);
        navigationActuator = configurator.getActuator("NavigationActuator", NavigationActuator.class);
    }

    @Override
    public boolean init() {
        if (timeout > 0) {
            logger.debug("Using timeout of " + timeout + " ms");
            timeout += Time.currentTimeMillis();
        }
        try {
            originalPolygon = originalPolygonSlot.recall();

            if (originalPolygon == null) {
                logger.error("your OriginalPolygonSlot was empty");
                return false;
            }

        } catch (CommunicationException ex) {
            logger.fatal("exception", ex);
            return false;
        }
        try {
            reducedPolygon = reducedPolygonSlot.recall();

            if (reducedPolygon == null) {
                logger.error("your ReducedPolygonSlot was empty");
                return false;
            }

        } catch (CommunicationException ex) {
            logger.fatal("Unable to read from memory: ", ex);
            return false;
        }
        try {
            currentPosition = currentPositionSlot.recall();

            if (currentPosition == null) {
                logger.error("your CurrentPositionSlot was empty");
                return false;
            }

        } catch (CommunicationException ex) {
            logger.fatal("Unable to read from memory: ", ex);
            return false;
        }
        try {
            cameraAttributes = cameraAttributesSensor.readLast(1000);
            if (cameraAttributes == null) {
                logger.error("cameraAttributes from its sensor was null");
                return false;
            }
            logger.debug("Read cameraAttributes from Sensor: " + cameraAttributes.toString());
        } catch (IOException | InterruptedException e) {
            logger.error("Could not read from cameraAttributes sensor");
        }
        checkedRequiredPercentage = (1 - reducedPolygon.getArea(LengthUnit.METER)/originalPolygon.getArea(LengthUnit.METER)) > percentageToCheck;

        return true;
    }

    @Override
    public ExitToken execute() {
        if (timeout > 0) {
        if (Time.currentTimeMillis() > timeout) {
            logger.info("Timeout reached");
            if(momentaryBestPoint != null){
                logger.info("returning momentary best point");
                return tokenSuccess;
            }
            logger.error("could not find a single valid viewpoint!");
            return tokenError;
        }
    }
        if(checkedRequiredPercentage){
            return tokenSuccessPercentageToCheckReached;
        }
        if(!momentaryPlan.isDone()){
            return ExitToken.loop(50);
        }
        try {
            if(momentaryPlan.get() != null && momentaryBestPoint != null){
                generatedPoints.add(momentaryBestPoint);
            }
        } catch (InterruptedException | ExecutionException e) {
            e.printStackTrace();
        }

        if(generatedPoints.size() < amountOfGenerations){
            PositionData pd = genPoint();
            if(!reducedPolygon.contains(pd)){
                momentaryBestPoint = null;
                return ExitToken.loop(50);
            }
            pointReachable(pd);
            return ExitToken.loop(50);
        }

        for(PositionData pos : generatedPoints){

            PrecisePolygon viewPolygon = generateViewPolygon(pos);
            PrecisePolygon overlap = reducedPolygon.getViewOverlap(viewPolygon);

            if(overlap.getArea(LengthUnit.METER) > momentaryOverlap){
                momentaryOverlap = overlap.getArea(LengthUnit.METER);
                momentaryBestPoint = pos;
            }
        }
        navigationGoalData = new NavigationGoalData(momentaryBestPoint);

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

    private PositionData genPoint(){
        double minX = reducedPolygon.getMinX(LengthUnit.METER);
        double maxX = reducedPolygon.getMaxX(LengthUnit.METER);
        double minY = reducedPolygon.getMinY(LengthUnit.METER);
        double maxY = reducedPolygon.getMaxY(LengthUnit.METER);

        double randX = ThreadLocalRandom.current().nextDouble(minX, maxX);
        double randY = ThreadLocalRandom.current().nextDouble(minY, maxY);
        double randYaw = ThreadLocalRandom.current().nextDouble(0.0, 2 * Math.PI);

        return new PositionData(randX, randY, randYaw, LengthUnit.METER, AngleUnit.RADIAN);
    }

    private void pointReachable(PositionData positionData){
        momentaryBestPoint = positionData;
        try {
            momentaryPlan = navigationActuator.getPlan(new NavigationGoalData(positionData), currentPosition);
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    private PrecisePolygon generateViewPolygon(PositionData positionData){
        PrecisePolygon polygon = new PrecisePolygon();
        polygon.addPoint(positionData);
        double distance = 100.0;
        double angleEachSide = cameraAttributes.getFovH()/2 - fovDeadzone;

        Point2D right = new Point2D(positionData.getX(LengthUnit.METER) + distance*Math.cos(positionData.getYaw(AngleUnit.RADIAN)-angleEachSide),
                positionData.getY(LengthUnit.METER) + Math.sin(positionData.getYaw(AngleUnit.RADIAN)-angleEachSide),
                LengthUnit.METER);

        Point2D left = new Point2D(positionData.getX(LengthUnit.METER) + distance*Math.cos(positionData.getYaw(AngleUnit.RADIAN)+angleEachSide),
                positionData.getY(LengthUnit.METER) + Math.sin(positionData.getYaw(AngleUnit.RADIAN)+angleEachSide),
                LengthUnit.METER);

        polygon.addPoint(right);
        polygon.addPoint(left);
        return polygon;
    }
}
