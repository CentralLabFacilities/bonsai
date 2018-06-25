package de.unibi.citec.clf.bonsai.skills.helper;



import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.grasp.RobotType;
import java.io.IOException;

/**
 * 
 *
 * @author lruegeme
 *
 */
public class FetchSensorData extends AbstractSkill {

    // used tokens
    private ExitToken tokenSuccessBiron;
    private ExitToken tokenSuccessMeka;

    Sensor<Point3D> sen;
    private RobotType t = null;

    @Override
    public void configure(ISkillConfigurator configurator) {

       sen = configurator.getSensor("PointSensor", Point3D.class);
        
    }

    @Override
    public boolean init() {


        return true;
    }

    @Override
    public ExitToken execute() {
        if(!sen.hasNext()) return ExitToken.loop();
        try {
            Point3D data = sen.readLast(1000);
            logger.error(data);
        } catch (IOException | InterruptedException e) {
            e.printStackTrace();
        }
        return ExitToken.fatal();
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
