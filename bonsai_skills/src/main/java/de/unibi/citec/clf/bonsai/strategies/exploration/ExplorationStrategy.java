package de.unibi.citec.clf.bonsai.strategies.exploration;



import de.unibi.citec.clf.btl.data.map.Annotation;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.geometry.Pose2D;

/**
 * This interface defines strategies, that produce navigation goals in order to
 * explore the current environment.
 * 
 * @author lziegler
 */
public interface ExplorationStrategy {

    /**
     * Calculates a new navigation goal depending on the robot's current
     * position.
     * 
     * @param currentPosition
     *            The current position of the robot.
     * @throws NoGoalFoundException
     *             Is thrown if no further goal could be generated.
     * @return A reasonable new goal.
     */
    NavigationGoalData getNextGoal(Pose2D currentPosition)
            throws NoGoalFoundException;

    /**
     * Calculates a new navigation goal depending on the robot's current
     * position.
     * 
     * @param currentPosition
     *            The current position of the robot.
     * @param region
     *            The region, that should be explored.
     * @throws NoGoalFoundException
     *             Is thrown if no further goal could be generated.
     * @return A reasonable new goal.
     */
    NavigationGoalData getNextGoal(Pose2D currentPosition,
                                   Annotation region) throws NoGoalFoundException;

    /**
     * This exception should be thrown, if no further navigation goal could be
     * generated.
     * 
     * @author lziegler
     */
    @SuppressWarnings("serial")
    class NoGoalFoundException extends Exception {

        /**
         * Creates a new exception.
         */
        public NoGoalFoundException() {
            super();
        }

        /**
         * Creates a new exception.
         * 
         * @param message
         *            A user specified error message.
         */
        public NoGoalFoundException(String message) {
            super(message);
        }
    }
}
