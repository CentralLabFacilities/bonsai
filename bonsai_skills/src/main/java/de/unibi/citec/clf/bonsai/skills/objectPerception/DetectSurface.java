package de.unibi.citec.clf.bonsai.skills.objectPerception;

import de.unibi.citec.clf.bonsai.actuators.ObjectDetectionActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.btl.data.geometry.BoundingBox3D;
import de.unibi.citec.clf.btl.units.LengthUnit;

import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;

/**
 * Robot recognizes a surface in front of him e.g. table
 * <pre>
 *
 * Slots:
 *  TableBox: [BoundingBox3D] [Write]
 *      -> Memory slot the detected surface will be written to
 *
 * ExitTokens:
 *  success:            Successfully detected table
 *  error:              An error occurred, e.g. no table was found
 *
 * Sensors:
 *
 * Actuators:
 *  ObjectDetectionActuator: [ObjectDetectionActuator]
 *      -> Called to detect the surface
 *
 * </pre>
 *
 * @author lruegeme
 */
@Deprecated
public class DetectSurface extends AbstractSkill {

    private ExitToken tokenSuccess;
    private ExitToken tokenError;

    private MemorySlotWriter<BoundingBox3D> tableSlot;

    private ObjectDetectionActuator detectObjectsActuator;

    private Future<BoundingBox3D> ret;
    private BoundingBox3D box3D;

    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        tokenError = configurator.requestExitToken(ExitStatus.ERROR());

        tableSlot = configurator.getWriteSlot("TableBox", BoundingBox3D.class);
        detectObjectsActuator = configurator.getActuator("ObjectDetectionActuator", ObjectDetectionActuator.class);
    }

    @Override
    public boolean init() {
        try {
            ret = detectObjectsActuator.detectSurface();
        } catch (IOException e) {
            logger.error(e);
            return false;
        }

        return true;
    }

    @Override
    public ExitToken execute() {

        if(!ret.isDone()) {
            return ExitToken.loop();
        }

        try {
            box3D = ret.get();
        } catch (InterruptedException | ExecutionException e) {
            logger.fatal(e);
            return ExitToken.fatal();
        }

        LengthUnit lu = LengthUnit.METER;
        double surfaceArea = box3D.getSize().getX(lu) * box3D.getSize().getY(lu);
        if(surfaceArea < 0.001) {
            logger.error("Table to small or none found, surfaceArea:" + surfaceArea + "m^2");
            return tokenError;
        }

        return tokenSuccess;
    }

    @Override
    public ExitToken end(ExitToken curToken) {

        if (curToken.getExitStatus().isSuccess()) {
            try {
                tableSlot.memorize(box3D);
            } catch (CommunicationException ex) {
                logger.error("Could not save table");
                return tokenError;
            }
        }
        return curToken;

    }
}
