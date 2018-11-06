package de.unibi.citec.clf.bonsai.actuators;



import de.unibi.citec.clf.bonsai.core.object.Actuator;
import de.unibi.citec.clf.btl.data.navigation.CommandResult;
import de.unibi.citec.clf.btl.data.navigation.DriveData;
import de.unibi.citec.clf.btl.data.navigation.GlobalPlan;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.navigation.TurnData;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import de.unibi.citec.clf.btl.units.RotationalSpeedUnit;
import de.unibi.citec.clf.btl.units.SpeedUnit;

import javax.annotation.Nullable;
import java.io.IOException;
import java.util.concurrent.Future;

/**
 * Base interface for all actuators that control the robots pose.
 * 
 * @author jwienke
 */
public interface NavigationActuator extends Actuator {

    /**
     * Sets a new goal to move to.
     * 
     * @param data
     *            new goal
     * @throws IOException
     *             communication error
     */
    void setGoal(NavigationGoalData data) throws IOException;

    /**
     * Tries if a goal is reachable. The goal tolerance will be used to alter
     * the plan.
     * 
     * @param data
     *            new goal
     * @return corresponding global plan for the goal
     * @throws IOException
     *             communication error
     */
    GlobalPlan tryGoal(NavigationGoalData data) throws IOException;
    
    /**
     * Tries if a goal is reachable. The goal tolerance will be used to alter
     * the plan.
     * 
     * @param data
     *            goal position
     * @param startPos
     *            start position 
     * @return corresponding global plan for the goal
     * @throws IOException
     *             communication error
     */
    Future<GlobalPlan> getPlan(NavigationGoalData data, PositionData startPos) throws IOException;

    /**
     * Drives the robot forward or behind.
     * 
     * @param distance
     *            the distance
     * @throws IOException
     *             communication error
     */
    void drive(double distance, LengthUnit unit, double speed, SpeedUnit sunit) throws IOException;

    /**
     * Turns the robot in a specific angle.
     * 
     * @param angle
     *            the angle
     * @throws IOException
     *             communication error
     */
    void turn(double angle, AngleUnit unit, double speed, RotationalSpeedUnit sunit) throws IOException;

    /**
     * Manually stop the robot as fast as possible.
     * 
     * @throws IOException
     *             communication error
     */
    void manualStop() throws IOException;

    /**
     * Getter for the current navigation goal.
     * 
     * @return An instance of {@link NavigationGoalData} representing the
     *         current goal of the navigation algorithm.
     * @throws IOException
     *             communication error
     */
    NavigationGoalData getCurrentGoal() throws IOException;
    
    Future<CommandResult> moveRelative(@Nullable DriveData drive, @Nullable TurnData turn) throws IOException;
    Future<CommandResult> navigateToCoordinate(NavigationGoalData data) throws IOException;

    //What is this
    @Deprecated  Future<CommandResult> navigateRelative(NavigationGoalData data);
    @Deprecated  Future<CommandResult> navigateToInterrupt(NavigationGoalData data);
    
    void clearCostmap() throws IOException;
}
