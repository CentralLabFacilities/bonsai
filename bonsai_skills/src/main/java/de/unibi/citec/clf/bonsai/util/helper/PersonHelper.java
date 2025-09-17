package de.unibi.citec.clf.bonsai.util.helper;


import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.geometry.PolarCoordinate;
import de.unibi.citec.clf.btl.data.geometry.Pose2D;
import de.unibi.citec.clf.btl.data.person.PersonData;
import de.unibi.citec.clf.btl.data.person.PersonDataList;
import de.unibi.citec.clf.btl.tools.MathTools;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import org.apache.log4j.Logger;

import java.io.IOException;
import java.util.Collections;
import java.util.LinkedList;

/**
 * A class responsible for the various management activities related to persons found by the robot.
 *
 * @author jwienke
 * @author lkettenb
 */
public final class PersonHelper {

    private PersonHelper() {
    }

    /**
     * The log.
     */
    private static final Logger logger = Logger.getLogger(PersonHelper.class);

    /**
     * Max. distance to accept a person standing in front of the robot.
     */
    private static final double FRONT_MAX_DISTANCE = 2500;

    /**
     * Maximum angle from the front orientation of the robot in which a person is accepted as standing in front of ToBI.
     * This angle is meant as an absolute value to each direction.
     */
    private static final double FRONT_MAX_ANGLE = 0.6; //was 3.0

    /**
     * Maximum time to recognize person.
     */
    private static final long RECOGNITION_TIME = 20000;

    /**
     * The yaw tolerance factor to calculate yaw tolerance.
     */
    private static final int YAW_TOLERANCE_FACTOR = 5;


    /**
     * Tells if the given person is standing in front of the robot so that it can be recognized using the camera.
     *
     * @param p             Person to check
     * @param robotPosition
     * @return <code>true</code> if person is standing in front of the robot facing it within a small distance, else
     * <code>false</code>
     */
    public static boolean isStandingInFront(PersonData p, Pose2D robotPosition) {

        PolarCoordinate polar = new PolarCoordinate(MathTools.globalToLocal(
                p.getPosition(), robotPosition));

        logger.debug("Person " + p.getUuid() + " frame person:" + p.getFrameId()
                + "\n dist:" + polar.getDistance(LengthUnit.METER)
                + "\n angle:" + polar.getAngle(AngleUnit.RADIAN));

        if (polar.getDistance(LengthUnit.MILLIMETER) > FRONT_MAX_DISTANCE) {
            logger.info("Person too far away");
            return false;
        }

        if (Math.abs(polar.getAngle(AngleUnit.RADIAN)) > FRONT_MAX_ANGLE) {
            logger.info("Person  not in right angle");
            return false;
        }


        return true;
    }


    /**
     * Returns the nearest person in front of the robot that is facing the robot ready to be recognized or anything
     * else.
     *
     * @param personSensor   Person sensor to use.
     * @param positionSensor Position sensor to fix missing coordinates
     * @return Person in front of robot or <code>null</code> if no person is standing in front.
     */
    public static PersonData getNextPersonInFront(
            Sensor<PersonDataList> personSensor, Sensor<Pose2D> positionSensor) {

        List<PersonData> persons = null;
        Pose2D robot = null;

        try {
            robot = positionSensor.readLast(500);
            persons = personSensor.readLast(500);
            if (robot == null || persons == null) {
                logger.warn("robotSensor or personSensor timed out (500ms) returning null");
                return null;
            }

            if (persons.isEmpty()) {
                logger.debug("PERSONSENSOR: has no Persons");
                return null;
            }
        } catch (InterruptedException | IOException ex) {
            logger.error(ex.getMessage());
        }

        PersonHelper.sortPersonsByDistance(persons, robot);

        java.util.List<PersonData> personDataList = new LinkedList<>();
        logger.debug("PERSONSENSOR: persons: " + ((persons != null) ? persons.size() : 0));
        for (PersonData p : persons) {
            if (isStandingInFront(p, robot)) {
                personDataList.add(p);
            }
        }
        sortPersonsByDistance(personDataList, robot);

        if (personDataList.isEmpty()) {
            logger.debug("PERSONHELPER no person in front");
            return null;
        }

        return personDataList.get(0);
    }

    /**
     * Sorts a list of persons by distance in place, so that the person with the smallest distance to the robot is the
     * first element of the list.
     *
     * @param persons List of persons to sort.
     */
    public static void sortPersonsByDistance(java.util.List<PersonData> persons, final Pose2D robPos) {
        Collections.sort(persons, (o1, o2) -> {
            PolarCoordinate polar1 = new PolarCoordinate(MathTools.localToOther(o1.getPosition(), robPos));
            PolarCoordinate polar2 = new PolarCoordinate(MathTools.localToOther(o2.getPosition(), robPos));
            return Double.compare(polar1.getDistance(LengthUnit.MILLIMETER), polar2.getDistance(LengthUnit.MILLIMETER));
        });
    }

    public static void sortPersonsByDistance(java.util.List<PersonData> persons) {
        Collections.sort(persons, (o1, o2) -> {
            assert(o1.isInBaseFrame() && o2.isInBaseFrame());
            PolarCoordinate polar1 = new PolarCoordinate(o1.getPosition());
            PolarCoordinate polar2 = new PolarCoordinate(o2.getPosition());
            return Double.compare(polar1.getDistance(LengthUnit.MILLIMETER), polar2.getDistance(LengthUnit.MILLIMETER));
        });
    }
}
