package de.unibi.citec.clf.btl.data.status;



import de.unibi.citec.clf.btl.Type;

/**
 * 
 * @author fsiepman
 */
public class RobotState extends Type {

	public static final String CURRENT_STATE_ELEMENT_NAME = "CURRENTSTATE";
	public static final String PREVIOUS_STATE_ELEMENT_NAME = "PREVIOUSSTATE";
	public static final String STATE_TARGET_ELEMENT_NAME = "STATETARGET";

	public enum RobotStates {

		/**
		 * The robot is driving to a position
		 */
		DRIVE_TO,
		/**
		 * The robot shall speak to an interaction partner
		 */
		TALK_TO,
		/**
		 * The robot shall return to the HOME position, normally (0,0)
		 */
		GO_HOME,
		/**
		 * The robot is waiting for command somewhere
		 */
		WAITING
	}

	protected RobotStates previousState;
	protected RobotStates currentState;
	protected String targetName;

	public RobotState() {
	}

	/**
	 * Returns the current state of the robot.
	 * 
	 * @return RobotState current state of the robot
	 */
	public RobotStates getCurrenState() {
		return currentState;
	}

	/**
	 * Returns the previous state of the robot.
	 * 
	 * @return RobotState previous state of the robot
	 */
	public RobotStates getPreviousState() {
		return previousState;
	}

	/**
	 * Set the current robot state
	 * 
	 * @param currenState
	 *            current state of the robot
	 */
	public void setCurrenState(RobotStates currenState) {
		this.currentState = currenState;
	}

	/**
	 * Set previous robot state
	 * 
	 * @param previousState
	 *            previous state of the robot
	 */
	public void setPreviousState(RobotStates previousState) {
		this.previousState = previousState;
	}

	public void setTargetName(String targetName) {
		this.targetName = targetName;
	}

	public String getTargetName() {
		return targetName;
	}

	/**
	 * {@inheritDoc}
	 */
	@Override
	public boolean equals(Object obj) {

		if (!(obj instanceof RobotState)) {
			return false;
		}

		RobotState other = (RobotState) obj;

		return super.equals(obj)
				&& (other.currentState.equals(currentState)
						&& other.previousState.equals(previousState) && other.targetName
							.equals(targetName));

	}

}
