//package de.unibi.citec.clf.bonsai.skills.deprecated.body;
//
//import de.unibi.citec.clf.bonsai.actuators.JointControllerActuator;
//import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
//import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
//import de.unibi.citec.clf.bonsai.core.time.Time;
//import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
//import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
//import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
//import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException;
//import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
//import java.io.IOException;
//import java.util.concurrent.Future;
//
///**
// * Moves the pan/tilt joints to specific positions.
// *
// * TODO: unmekafy
// *
// * @author lruegeme
// */
//
//// USE SETROBOTGAZE INSTEAD
//
//@Deprecated
//public class MoveHead extends AbstractSkill {
//
//    private static final String KEY_J0 = "#_J0";
//    private static final String KEY_J1 = "#_J1";
//    private static final String KEY_TIMEOUT = "#_TIMEOUT";
//
//    private JointControllerActuator jointcontroller;
//
//    private ExitToken tokenSuccess;
//    private ExitToken tokenError;
//
//    private double j0;
//    private double j1;
//
//    private MemorySlot<Double> slotJ0;
//    private MemorySlot<Double> slotJ1;
//
//    private long timeout = 5000;
//    Future<Boolean> b;
//
//    @Override
//    public void configure(ISkillConfigurator configurator) throws SkillConfigurationException {
//        jointcontroller = configurator.getActuator("MekaJointActuator", JointControllerActuator.class);
//
//        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS());
//        tokenError = configurator.requestExitToken(ExitStatus.ERROR());
//
//        j0 = configurator.requestOptionalDouble(KEY_J0, Double.NaN);
//        j1 = configurator.requestOptionalDouble(KEY_J1, Double.NaN);
//
//        timeout = configurator.requestOptionalInt(KEY_TIMEOUT, (int) timeout);
//
//        if (j0 == Double.NaN) {
//            logger.warn("key " + KEY_J0 + " not given, using slot");
//            slotJ0 = configurator.getSlot("SlotJ0", Double.class);
//        }
//
//        if (j1 == Double.NaN) {
//            logger.warn("key " + KEY_J1 + " not given, using slot");
//            slotJ1 = configurator.getSlot("SlotJ1", Double.class);
//        }
//
//    }
//
//    @Override
//    public boolean init() {
//
//        try {
//            if (slotJ0 != null) {
//                j0 = (float) (double) slotJ0.recall();
//            }
//            if (slotJ1 != null) {
//                j1 = (float) (double) slotJ1.recall();
//            }
//        } catch (CommunicationException ex) {
//            logger.fatal("exception", ex);
//            return false;
//        }
//
//        logger.debug("going to: " + j0 + " / " + j1);
//
//        try {
//            b = jointcontroller.goToHeadPose((float) j0, (float) j1);
//        } catch (IOException ex) {
//            logger.error(ex);
//        }
//
//        if (timeout > 0) {
//            timeout += Time.currentTimeMillis();
//        }
//
//        return true;
//    }
//
//    @Override
//    public ExitToken execute() {
//        if (!b.isDone()) {
//            if (timeout > 0 && timeout < Time.currentTimeMillis()) {
//                return tokenError;
//            }
//            return ExitToken.loop();
//        }
//        return tokenSuccess;
//    }
//
//    @Override
//    public ExitToken end(ExitToken curToken) {
//        return curToken;
//    }
//
//}
