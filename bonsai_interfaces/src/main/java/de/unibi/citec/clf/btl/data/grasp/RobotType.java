package de.unibi.citec.clf.btl.data.grasp;


import de.unibi.citec.clf.btl.Type;
import org.apache.log4j.Logger;

import java.util.Map;

public class RobotType extends Type {

    public Robot type;

    public RobotType(Robot r) {
        this.type = r;
    }
    
    public enum Robot {

        BIRON, MEKA, PEPPER
    }

    private static Logger logger = Logger.getLogger(RobotType.class);

    
    public static RobotType readFromEnv() {
        Map<String, String> env = System.getenv();
        String type = env.get("ROBOT_TYPE");

        logger.fatal("enviroment $ROBOT_TYPE: " + type);
        if( type != null && !type.isEmpty() && type.equals("meka")) {
            return new RobotType(RobotType.Robot.MEKA);
        } else {
            return new RobotType(RobotType.Robot.BIRON);
        }
        
    }

    @Override
    public String toString() {
        return "RobotType: type=" + this.type.toString();
    }

}
