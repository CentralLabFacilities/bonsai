package de.unibi.citec.clf.bonsai.skills.deprecated.personPerception.openpose;


import de.unibi.citec.clf.bonsai.actuators.DetectPeopleActuator;
import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.exception.TransformException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.MemorySlotWriter;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill;
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus;
import de.unibi.citec.clf.bonsai.engine.model.ExitToken;
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator;
import de.unibi.citec.clf.bonsai.util.CoordinateSystemConverter;
import de.unibi.citec.clf.bonsai.util.CoordinateTransformer;
import de.unibi.citec.clf.btl.data.geometry.Point2D;
import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.geometry.Pose3D;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.data.person.PersonAttribute;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import java.io.IOException;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Tobi will look for a waving person and store its position in a
 * NavigationGoalSlot.
 *
 *
 * @author rfeldhans
 */
public class FindWavingPerson extends AbstractSkill {

    private ExitToken tokenSuccessNotFound;
    private ExitToken tokenSuccessFound;

    private long actuator_timeout = 20000;

    private MemorySlot<NavigationGoalData> navigationGoalSlot;
    NavigationGoalData globalGoal;

    private DetectPeopleActuator peopleActuator;

    private Future<PersonDataList> peopleFuture;

    private CoordinateTransformer coordTransformer;

    @Override
    public void configure(ISkillConfigurator configurator) {

        // request all tokens that you plan to return from other methods
        tokenSuccessNotFound = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("notFound"));
        tokenSuccessFound = configurator.requestExitToken(ExitStatus.SUCCESS().withProcessingStatus("found"));

        navigationGoalSlot = configurator.getSlot("NavigationGoalDataSlot", NavigationGoalData.class);

        coordTransformer = (CoordinateTransformer) configurator.getTransform();

        peopleActuator = configurator.getActuator("PeopleActuator", DetectPeopleActuator.class);
    }

    @Override
    public boolean init() {
        actuator_timeout += Time.currentTimeMillis();
        try {
            peopleFuture = peopleActuator.getPeople(false, false);
        } catch (InterruptedException | ExecutionException e) {
            logger.error(e);
            return false;
        }
        return true;
    }

    @Override
    public ExitToken execute() {

        PersonDataList people;

        if (!peopleFuture.isDone()) {
            if (actuator_timeout < Time.currentTimeMillis()) {
                return ExitToken.fatal();
            }
            return ExitToken.loop(50);
        }

        try {
            people = peopleFuture.get();
        } catch (InterruptedException | ExecutionException e) {
            logger.error(e);
            return ExitToken.fatal();
        }

        for(PersonData p : people) {
            if(!p.getPersonAttribute().getGestures().stream().anyMatch(gesture -> gesture.equals(PersonAttribute.Gesture.WAVING)
            || gesture.equals(PersonAttribute.Gesture.RAISING_LEFT_ARM)
            || gesture.equals(PersonAttribute.Gesture.RAISING_RIGHT_ARM))) continue;

            if (!p.getPosition().isInBaseFrame()) {
                //PositionData pose = p.getPosition();
                //Point3D point = new Point3D()
                //try {
                //    p.setPosition(coordTransformer.transform(p.getPosition(), "base_link"));
                //} catch (TransformException e) {
                //    throw new RuntimeException(e);
                //}
                logger.fatal("please implement me");
            }

            try {
                navigationGoalSlot.memorize(createNavGoal(p.getPosition()));
            } catch (CommunicationException e) {
                throw new RuntimeException(e);
            }
        }
        return tokenSuccessFound;
    }



    NavigationGoalData createNavGoal(PositionData pos) {
        Pose3D goal;
        try {
            goal = (coordTransformer.transform(pos, "map"));
        } catch (TransformException e) {
            throw new RuntimeException(e);
        }
        NavigationGoalData nav = new NavigationGoalData("", goal.getTranslation().getX(LengthUnit.METER), goal.getTranslation().getY(LengthUnit.METER), 0, 0.2, Math.PI, PositionData.ReferenceFrame.GLOBAL, LengthUnit.METER, AngleUnit.RADIAN);
        return nav;
    }

    @Override
    public ExitToken end(ExitToken curToken) {
        if (curToken.equals(tokenSuccessFound)) {
            try {
                navigationGoalSlot.memorize(globalGoal);
            } catch (CommunicationException ex) {
                Logger.getLogger(SearchForPerson.class.getName()).log(Level.SEVERE, null, ex);
            }
        }
        return curToken;
    }

}
