package de.unibi.citec.clf.bonsai.skills.helper;

import de.unibi.citec.clf.bonsai.actuators.StringActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.exception.TransformException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.CoordinateTransformer;
import de.unibi.citec.clf.btl.Transform;

import java.io.IOException;

/**
 * @author lruegeme
 */
public class PrintTransform extends AbstractSkill {

    static final String KEY_FROM = "#_FROM";
    static final String KEY_TO = "#_TO";

    private ExitToken tokenSuccess;
    private CoordinateTransformer transform;
    private String from;
    private String to;


    @Override
    public void configure(ISkillConfigurator configurator) {

        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
        transform = (CoordinateTransformer) configurator.getTransform();

        from = configurator.requestValue(KEY_FROM);
        to = configurator.requestValue(KEY_TO);
    }

    @Override
    public boolean init() {
        try {
            final Transform lookup = transform.lookup(from, to, System.currentTimeMillis());
            logger.fatal(lookup);
        } catch (TransformException e) {
            logger.fatal(e);
            return false;
        }
        return true;
    }

    @Override
    public ExitToken execute() {

        return ExitToken.fatal();
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        return curToken;
    }
}
