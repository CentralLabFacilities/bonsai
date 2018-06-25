package de.unibi.citec.clf.bonsai.strategies.follow;



import java.io.IOException;

/**
 * This interface specifies all methods that 
 * follow me strategies must implement.
 * 
 * @author nkoester
 * @author lkettenb
 */
public interface FollowStrategy {
    
    /**
     * Use this method to initialize variables, sensors, actuators and so on.
     */
	void init();
    
    /**
     * Follow next person. The meaning of 'next' depends on the strategy.
     * Probably it is the person in front of the robot/sensor.
     * 
     * @throws IOException 
     */
	void execute() throws IOException;
    
    /**
     * Follow the person with the given id.
     * @param personId Id of the person to follow.
     * @throws IOException 
     */
	void execute(int personId) throws IOException;

}
