package de.unibi.citec.clf.bonsai.util.helper;

import de.unibi.citec.clf.bonsai.actuators.NavigationActuator;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
import de.unibi.citec.clf.bonsai.strategies.drive.DriveStrategy;
import de.unibi.citec.clf.bonsai.strategies.drive.NearestToTarget;
import de.unibi.citec.clf.bonsai.strategies.drive.NoStrategy;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import org.apache.log4j.Logger;

/**
 *
 * @author lruegeme
 */
public class DriveStrategyBuilder {

    private static Logger logger = Logger.getLogger(DriveStrategyBuilder.class);

    static public DriveStrategy createStrategy(String strategy, ISkillConfigurator conf, NavigationActuator navActuator,
            Sensor<PositionData> robotPositionSensor) throws SkillConfigurationException {
        switch (strategy) {
            case "NoStrategy":
                return new NoStrategy(navActuator, robotPositionSensor);
            case "NearestToTarget":
                return new NearestToTarget(navActuator, robotPositionSensor, conf);
            case "NearestToTargetInterrupt":
//                return new NearestToTargetInterrupt(navActuator, robotPositionSensor, variables);
            case "JustTheTip":
                //return new JustTheTip(navActuator, robotPositionSensor, variables, goalAnno.getPolygon());
            case "FastKBase":
                //return new FastKBase(navActuator, robotPositionSensor, variables, goalAnno.getPolygon());
            default:
                String ex = "You strategy is unknown, you set " + strategy;
                logger.fatal(ex);
                throw new SkillConfigurationException(ex);
        }
    }
}
