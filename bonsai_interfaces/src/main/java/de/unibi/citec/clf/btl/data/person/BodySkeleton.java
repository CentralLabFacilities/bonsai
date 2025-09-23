package de.unibi.citec.clf.btl.data.person;


import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.Type;
import de.unibi.citec.clf.btl.data.geometry.Point2D;
import java.util.Set;

import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.geometry.Pose2D;
import de.unibi.citec.clf.btl.data.geometry.Pose2D.ReferenceFrame;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.util.HashSet;
import org.apache.log4j.Logger;

/**
 * The Body class stores information about Body hypothesis coming from openpose.
 *
 * @author: jkummert
 * @author rfeldhans
 */
public class BodySkeleton extends Type {
    
    protected Logger logger = Logger.getLogger(this.getClass());

    public static class SkeletonJoint extends Type {

        public enum JointType {
            NOSE(1, "NOSE"), //
            NECK(2, "NECK"), //
            RSHOULDER(3, "RSHOULDER"), //
            RELBOW(4, "RELBOW"), //
            RWRIST(5, "RWRIST"), //
            LSHOULDER(6, "LSHOULDER"), //
            LELBOW(7, "LELBOW"), //
            LWRIST(8, "LWRIST"), //
            RHIP(9, "RHIP"), //
            RKNEE(10, "RKNEE"), //
            RANKLE(11, "RANKLE"), //
            LHIP(12, "LHIP"), //
            LKNEE(13, "LKNEE"), //
            LANKLE(14, "LANKLE"), //
            REYE(15, "REYE"), //
            LEYE(16, "LEYE"), //
            REAR(17, "REAR"), //
            LEAR(18, "LEAR"), //
            CHEST(19, "CHEST"), //

            UNKNOWN(999, "UNKNOWN");

            private final int jointId;
            private final String jointName;

            JointType(int id, String name) {
                this.jointName = name;
                this.jointId = id;
            }
        }

        private final JointType jointType;
        private final Point3D position;
        private int u;
        private int v;
        private final float confidence;

        private SkeletonJoint(JointType jointType, Point3D pos, float confidence, int u, int v) {
            this.jointType = jointType;
            this.position = pos;
            this.confidence = confidence;
            this.u = u;
            this.v = v;
        }

        public JointType getJointType() {
            return jointType;
        }

        public Point3D getJointPosition() {
            return position;
        }

        public float getConfidence() {
            return confidence;
        }

        public int getU() {
            return u;
        }

        public int getV() {
            return v;
        }
    }



    private List<SkeletonJoint> jointList;

    public BodySkeleton() {
        jointList = new List(SkeletonJoint.class);
    }

    public List<SkeletonJoint> getSkeletonList() {
        return jointList;
    }

    public boolean hasJoint(SkeletonJoint.JointType jointType) {
        for (SkeletonJoint joint : jointList) {
            if (joint.getJointType().equals(jointType) && joint.getConfidence() != 0 && joint.getU() != 0 && joint.getV() != 0) {
                return true;
            }
        }
        return false;
    }

    public SkeletonJoint getJoint(SkeletonJoint.JointType jointType) {
        for (SkeletonJoint joint : jointList) {
            if (joint.getJointType().equals(jointType)) {
                return joint;
            }
        }
        return null;
    }

    public void addJoint(SkeletonJoint.JointType jointType, Point3D position, float confidence, int u, int v) {
        SkeletonJoint joint = new SkeletonJoint(jointType, position, confidence, u, v);
        jointList.add(joint);
    }

    private double jointImageDist(SkeletonJoint a, SkeletonJoint b) {
        return Math.sqrt((a.getU() - b.getU()) * (a.getU() - b.getU()) + (a.getV() - b.getV()) * (a.getV() - b.getV()));
    }

    private double jointImageDistV(SkeletonJoint a, SkeletonJoint b) {
        return Math.sqrt((a.getV() - b.getV()) * (a.getV() - b.getV()));
    }

    public double getDistanceToRobot() {
        return Math.sqrt((getPosition().getX(LengthUnit.METER) * getPosition().getX(LengthUnit.METER))
                + (getPosition().getY(LengthUnit.METER) * getPosition().getY(LengthUnit.METER)));
    }

    public PersonAttribute.Posture getPose() {
        return getPoseRelativPictureCoordinates();
    }

    /**
     * Calculates the Posture without any hard pixel thresholds. Uses Picture
     * Coordinates.
     *
     * @return
     */
    public PersonAttribute.Posture getPoseRelativPictureCoordinates() {
        Point2D head = getHeadCenterPictureCoordinates();
        Point2D torso = getTorsoCenterPictureCoordinates();
        Point2D hips = getHipCenterPictureCoordinates();
        Point2D legs = getLegCenterPictureCoordinates();
        Point2D knees = getKneeCenterPictureCoordinates();
        Point2D ankles = getAnkleCenterPictureCoordinates();
        //System.out.println("Head: " + head + "; torso: " + torso + "; hips: " + hips + "; legs: " +legs + "; knees: " + knees + "; ankles: " +ankles);
        //System.out.println("torso to hips" + hips.sub(torso) + "hips to knees" + knees.sub(hips));

        Point2D orientationDiff = legs.sub(head);
        Double orientation = orientationDiff.getX(LengthUnit.METER) / orientationDiff.getY(LengthUnit.METER);
        if (orientation > 0.6 || orientation < -0.6) { //more difference in width than in height
            return PersonAttribute.Posture.LYING;
        }

        if (legs.equals(hips)) {//no legjoints seen; assume standing directly in front of the robot
            return PersonAttribute.Posture.STANDING;
        }

        Point2D head_torso = torso.sub(head);
        Point2D torso_hips = hips.sub(torso);
        Point2D hips_legs = legs.sub(hips);

        if (hips_legs.getX(LengthUnit.MILLIMETER) >= hips_legs.getY(LengthUnit.MILLIMETER) || -1 * hips_legs.getX(LengthUnit.MILLIMETER) >= hips_legs.getY(LengthUnit.MILLIMETER)) {//Person sitting in relief (person seen from the side)
            return PersonAttribute.Posture.SITTING;
        }

        if (hips.sub(torso).getY(LengthUnit.MILLIMETER) * 1.25 < knees.sub(hips).getY(LengthUnit.MILLIMETER)) {// easy accept if knees are way below the hips
            return PersonAttribute.Posture.STANDING;
        }

        if (10 - getDistanceToRobot() > knees.sub(hips).getY(LengthUnit.MILLIMETER) - hips.sub(torso).getY(LengthUnit.MILLIMETER)) {//quite ugly but works acceptably well for ~4 meters
            return PersonAttribute.Posture.SITTING;
        }
        //System.out.println(hips.sub(torso)+ "; " + knees.sub(hips) + "; dist " + getDistanceToRobot());
        //System.out.println("Head to legs: " + orientationDiff.getY(LengthUnit.MILLIMETER)/distance );

        return PersonAttribute.Posture.STANDING;
    }

    /**
     * Calculates the Posture without thresholds. Uses Room Coordinates.
     *
     * @return
     */
    public PersonAttribute.Posture getPoseRelativRoomCoordinates() {
        return PersonAttribute.Posture.STANDING;
    }

    /**
     * Return the position of the person this BodySkeleton represents. As it
     * will only be the middle point of all joints, it may be a bit off, eg if
     * the person points right or left with an arm or leg or is at the edge of
     * the screen and eg only a part of the arm is visible.
     *
     * @return A Point2D representing the Position of this BodySkeleton. If no
     * good position could be calculated, the position will lie directly on the
     * robot.
     */
    public Pose2D getPosition() {
        Point3D com = this.calculatelikelyPosition3D();
        Pose2D ret = new Pose2D(0, 0, 0, LengthUnit.METER, AngleUnit.RADIAN);
        if (com == null) {
            ret.setFrameId(ReferenceFrame.LOCAL);
        } else {
            ret.setX(com.getX(LengthUnit.METER), LengthUnit.METER);
            ret.setY(com.getY(LengthUnit.METER), LengthUnit.METER);
            ret.setFrameId(ReferenceFrame.GLOBAL);
        }
        return ret;
    }

    /**
     * Calculates the center of mass of this skeleton. Will just be a centroid.
     *
     * @return a Point3D which lies roughly in the middle of the skeleton.
     * Returns a Point which lies at the robotposition if there are no usable
     * joints in this BodySkeleton.
     */
    public Point3D calculateCenterOfMass() {
        Point3D com = new Point3D(0, 0, 0, LengthUnit.METER);
        int counter = 0;
        for (SkeletonJoint joint : jointList) {
            if (!hasJoint(joint.getJointType())) {
                continue;
            }
            if (Double.isNaN(joint.getJointPosition().getX(LengthUnit.METER))) {
                continue;
            }
            com = com.add(joint.getJointPosition());
            counter++;
        }
        if (counter == 0) {
            return new Point3D(counter, counter, counter, LengthUnit.METER);
        }
        Point3D div = new Point3D(counter, counter, counter, LengthUnit.METER);
        com = com.div(div);
        return com;
    }

    /**
     * Calculates the center of mass of this skeletons head, shoulders and neck.
     * Will just be a centroid. Used to get a more likely Position of the
     * person, for example for people sitting behind a table.
     *
     * @return a Point3D which lies roughly at the position of the skeleton.
     * Returns null if there are no usable
     * joints in this BodySkeleton.
     */
    private Point3D calculatelikelyPosition3D() {
        Point3D com = new Point3D(0, 0, 0, LengthUnit.METER);
        int counter = 0;
        for (SkeletonJoint joint : jointList) {
            if (!hasJoint(joint.getJointType())) {
                continue;
            }
            if (Double.isNaN(joint.getJointPosition().getX(LengthUnit.METER))) {
                continue;
            }
            if (joint.jointType != SkeletonJoint.JointType.LEAR
                    && joint.jointType != SkeletonJoint.JointType.REAR
                    && joint.jointType != SkeletonJoint.JointType.LEYE
                    && joint.jointType != SkeletonJoint.JointType.REYE
                    && joint.jointType != SkeletonJoint.JointType.NOSE
                    && joint.jointType != SkeletonJoint.JointType.NECK
                    && joint.jointType != SkeletonJoint.JointType.LSHOULDER
                    && joint.jointType != SkeletonJoint.JointType.RSHOULDER
                    ) {
                continue;
            }
            com = com.add(joint.getJointPosition());
            counter++;
        }
        if (counter == 0) {
            return null;
        }
        Point3D div = new Point3D(counter, counter, counter, LengthUnit.METER);
        com = com.div(div);
        return com;
    }

    /**
     * A more reliable and robust Method to check whether the Person described
     * by this BodySkeleton is waving. Will just check if one of the targets
     * wrists are above the shoulders.
     *
     * @return true if the person is waving, false otherwise.
     */
    public boolean getWaving() {

        Point2D shoulderCenter = getShoulderCenterPictureCoordinates();
        Point2D headCenter = getHeadCenterPictureCoordinates();
        Point2D rightWrist = null;
        Point2D leftWrist = null;
        //System.out.println("head/shoulder/2: " + shoulderCenter.sub(headCenter).getY(LengthUnit.MILLIMETER)/2);

        if (hasJoint(SkeletonJoint.JointType.RWRIST)) {
            rightWrist = new Point2D(getJoint(SkeletonJoint.JointType.RWRIST).getU(), getJoint(SkeletonJoint.JointType.RWRIST).getV(), LengthUnit.MILLIMETER);
            //System.out.println("right: " + shoulderCenter.sub(rightWrist).getY(LengthUnit.MILLIMETER));
            if (shoulderCenter.sub(rightWrist).getY(LengthUnit.MILLIMETER) > 0) {//right wrist lies above the head
                return true;
            }
        }
        if (hasJoint(SkeletonJoint.JointType.LWRIST)) {
            leftWrist = new Point2D(getJoint(SkeletonJoint.JointType.LWRIST).getU(), getJoint(SkeletonJoint.JointType.LWRIST).getV(), LengthUnit.MILLIMETER);
            //System.out.println("left: " + shoulderCenter.sub(leftWrist).getY(LengthUnit.MILLIMETER));
            if (shoulderCenter.sub(leftWrist).getY(LengthUnit.MILLIMETER) > 0) {//left wrist lies above the head
                return true;
            }
        }
        return false;
    }

    public PersonAttribute.Gesture getGesture() {
        return getGestureRelativePictureCoordinates();
    }

    public PersonAttribute.Gesture getGestureRelativePictureCoordinates() {
        //---------------setup variables and basic vectors

        Point2D headCenter = getHeadCenterPictureCoordinates();
        Point2D shoulderCenter = getShoulderCenterPictureCoordinates();
        Point2D hips = getHipCenterPictureCoordinates();

        Point2D rightElbow = null;
        Point2D rightWrist = null;

        Point2D leftElbow = null;
        Point2D leftWrist = null;


        if (hasJoint(SkeletonJoint.JointType.RSHOULDER) && hasJoint(SkeletonJoint.JointType.RELBOW) && hasJoint(SkeletonJoint.JointType.RWRIST)) {
            rightElbow = new Point2D(getJoint(SkeletonJoint.JointType.RELBOW).getU(), getJoint(SkeletonJoint.JointType.RELBOW).getV(), LengthUnit.MILLIMETER);
            rightWrist = new Point2D(getJoint(SkeletonJoint.JointType.RWRIST).getU(), getJoint(SkeletonJoint.JointType.RWRIST).getV(), LengthUnit.MILLIMETER);
        } else {
            //System.out.println("right arm not completely visible");
            return PersonAttribute.Gesture.NEUTRAL;
        }

        if (hasJoint(SkeletonJoint.JointType.LSHOULDER) && hasJoint(SkeletonJoint.JointType.LELBOW) && hasJoint(SkeletonJoint.JointType.LWRIST)) {
            leftElbow = new Point2D(getJoint(SkeletonJoint.JointType.LELBOW).getU(), getJoint(SkeletonJoint.JointType.LELBOW).getV(), LengthUnit.MILLIMETER);
            leftWrist = new Point2D(getJoint(SkeletonJoint.JointType.LWRIST).getU(), getJoint(SkeletonJoint.JointType.LWRIST).getV(), LengthUnit.MILLIMETER);
        } else {
            //System.out.println("left arm not completely visible");
            return PersonAttribute.Gesture.NEUTRAL;
        }

        //-------------------- Infos to Skeleton
        /*
        System.out.println("PointInfo:");
        System.out.println("\tHead: " + shoulderCenter + ";\n\tShoulder: " + shoulderCenter + ";\n\tHips: " + hips + ";\n\tWristR: " + rightWrist + ";\n\tWristL: " + leftWrist);
        System.out.println("\tHips->WristR: " + rightWrist.sub(hips) + ";\n\tHips->WristL: " + leftWrist.sub(hips));
        System.out.println("\tRight: len(Hips->Wrist)/len(Head->Hips): " + rightWrist.sub(hips).getLength(LengthUnit.MILLIMETER) / hips.sub(shoulderCenter).getLength(LengthUnit.MILLIMETER) + "\tLeft: len(Hips->Wrist)/len(Head->Hips): " + leftWrist.sub(hips).getLength(LengthUnit.MILLIMETER) / hips.sub(shoulderCenter).getLength(LengthUnit.MILLIMETER));
        System.out.println("\tRight: angle(head->wrist) " + shoulderCenter.getAngle(rightWrist) + "; Left: angle(head->wrist) " + shoulderCenter.getAngle(leftWrist));
        System.out.println("\tRight: angle(shoulder->wrist,elbow): " + rightShoulder.getAngle(rightWrist, rightElbow) + "; left: " + leftShoulder.getAngle(leftWrist, leftElbow));
        System.out.println("\tShouldercenter-Wrist(x/y): right:" + shoulderCenter.sub(rightWrist).getX(LengthUnit.METER)/shoulderCenter.sub(rightWrist).getY(LengthUnit.METER) + "; left: " + shoulderCenter.sub(leftWrist).getX(LengthUnit.METER)/shoulderCenter.sub(leftWrist).getY(LengthUnit.METER));
        System.out.println("\tShouldercenter-Elbow(x/y): right:" + shoulderCenter.sub(rightElbow).getX(LengthUnit.METER)/shoulderCenter.sub(rightElbow).getY(LengthUnit.METER) + "; left: " + shoulderCenter.sub(leftElbow).getX(LengthUnit.METER)/shoulderCenter.sub(leftElbow).getY(LengthUnit.METER));
         */
        double rightShoulderWristDir = shoulderCenter.sub(rightWrist).getX(LengthUnit.METER) / shoulderCenter.sub(rightWrist).getY(LengthUnit.METER);
        double rightShoulderElbowDir = shoulderCenter.sub(rightElbow).getX(LengthUnit.METER) / shoulderCenter.sub(rightElbow).getY(LengthUnit.METER);
        double leftShoulderWristDir = shoulderCenter.sub(leftWrist).getX(LengthUnit.METER) / shoulderCenter.sub(leftWrist).getY(LengthUnit.METER);
        double leftShoulderElbowDir = shoulderCenter.sub(leftElbow).getX(LengthUnit.METER) / shoulderCenter.sub(leftElbow).getY(LengthUnit.METER);

        //--------------------- actual gesture detection
        if (rightWrist.sub(hips).getLength(LengthUnit.MILLIMETER) / hips.sub(headCenter).getLength(LengthUnit.MILLIMETER) > 1 && leftWrist.sub(hips).getLength(LengthUnit.MILLIMETER) / hips.sub(headCenter).getLength(LengthUnit.MILLIMETER) < 0.7) {
        } else if (leftWrist.sub(hips).getLength(LengthUnit.MILLIMETER) / hips.sub(headCenter).getLength(LengthUnit.MILLIMETER) > 1 && rightWrist.sub(hips).getLength(LengthUnit.MILLIMETER) / hips.sub(headCenter).getLength(LengthUnit.MILLIMETER) < 0.7) {
        } else {
            return PersonAttribute.Gesture.NEUTRAL;
        }
        //System.out.println("interesting arm: " + interestingArm);

        if ((rightShoulderElbowDir > 4 && rightShoulderWristDir > 4)
                || (rightShoulderElbowDir < -4 && rightShoulderWristDir < -4)) {
            return PersonAttribute.Gesture.POINTING_LEFT;
        }

        if ((leftShoulderElbowDir > 4 && leftShoulderWristDir > 4)
                || (leftShoulderElbowDir < -4 && leftShoulderWristDir < -4)) {
            return PersonAttribute.Gesture.POINTING_RIGHT;
        }

        if (rightShoulderElbowDir < 0 && rightShoulderElbowDir > -2
                && rightShoulderWristDir < 0 && rightShoulderWristDir > -2
                && leftShoulderElbowDir < 0 && leftShoulderElbowDir > -2
                && leftShoulderWristDir < 0 && leftShoulderWristDir > -2) {
            return PersonAttribute.Gesture.RAISING_RIGHT_ARM;
        }
        if (rightShoulderElbowDir > 0 && rightShoulderElbowDir < 2
                && rightShoulderWristDir > 0 && rightShoulderWristDir < 2
                && leftShoulderElbowDir > 0 && leftShoulderElbowDir < 2
                && leftShoulderWristDir > 0 && leftShoulderWristDir < 2) {
            return PersonAttribute.Gesture.RAISING_LEFT_ARM;
        }

        return PersonAttribute.Gesture.WAVING;
    }

    public PersonAttribute.Gesture getGestureOld() {
        double raisedThresh = 0.15;
        double wavingThresh = 0.15;
        double pointingThresh = 0.1;

        if (hasJoint(SkeletonJoint.JointType.RSHOULDER)) {
            if (hasJoint(SkeletonJoint.JointType.RELBOW)) {
                if (hasJoint(SkeletonJoint.JointType.RWRIST)) {
                    if (((getJoint(SkeletonJoint.JointType.RELBOW).position.getZ(LengthUnit.METER)
                            < getJoint(SkeletonJoint.JointType.RSHOULDER).position.getZ(LengthUnit.METER) + pointingThresh)
                            || (getJoint(SkeletonJoint.JointType.RELBOW).position.getZ(LengthUnit.METER)
                            > getJoint(SkeletonJoint.JointType.RSHOULDER).position.getZ(LengthUnit.METER) - pointingThresh))
                            && getJoint(SkeletonJoint.JointType.RWRIST).position.getZ(LengthUnit.METER)
                            < getJoint(SkeletonJoint.JointType.RELBOW).position.getZ(LengthUnit.METER) + wavingThresh) {
                        return PersonAttribute.Gesture.WAVING;
                    }
                }
            }
        } else if (hasJoint(SkeletonJoint.JointType.LSHOULDER)) {
            if (hasJoint(SkeletonJoint.JointType.LELBOW)) {
                if (hasJoint(SkeletonJoint.JointType.LWRIST)) {
                    if (((getJoint(SkeletonJoint.JointType.LELBOW).position.getZ(LengthUnit.METER)
                            < getJoint(SkeletonJoint.JointType.LSHOULDER).position.getZ(LengthUnit.METER) + pointingThresh)
                            || (getJoint(SkeletonJoint.JointType.LELBOW).position.getZ(LengthUnit.METER)
                            > getJoint(SkeletonJoint.JointType.LSHOULDER).position.getZ(LengthUnit.METER) - pointingThresh))
                            && getJoint(SkeletonJoint.JointType.LWRIST).position.getZ(LengthUnit.METER)
                            < getJoint(SkeletonJoint.JointType.LELBOW).position.getZ(LengthUnit.METER) + wavingThresh) {
                        return PersonAttribute.Gesture.WAVING;
                    }
                }
            }
        } else if (hasJoint(SkeletonJoint.JointType.RSHOULDER)) {
            if (hasJoint(SkeletonJoint.JointType.RELBOW)) {
                if (getJoint(SkeletonJoint.JointType.RELBOW).position.getZ(LengthUnit.METER)
                        < getJoint(SkeletonJoint.JointType.RSHOULDER).position.getZ(LengthUnit.METER) + raisedThresh) {
                    return PersonAttribute.Gesture.RAISING_RIGHT_ARM;
                }
            }
        } else if (hasJoint(SkeletonJoint.JointType.LSHOULDER)) {
            if (hasJoint(SkeletonJoint.JointType.LELBOW)) {
                if (getJoint(SkeletonJoint.JointType.LELBOW).position.getZ(LengthUnit.METER)
                        < getJoint(SkeletonJoint.JointType.LSHOULDER).position.getZ(LengthUnit.METER) + raisedThresh) {
                    return PersonAttribute.Gesture.RAISING_LEFT_ARM;
                }
            }
        } else if (hasJoint(SkeletonJoint.JointType.RSHOULDER)) {
            if (hasJoint(SkeletonJoint.JointType.RELBOW)) {
                if (hasJoint(SkeletonJoint.JointType.RWRIST)) {
                    if (((getJoint(SkeletonJoint.JointType.RELBOW).position.getZ(LengthUnit.METER)
                            < getJoint(SkeletonJoint.JointType.RSHOULDER).position.getZ(LengthUnit.METER) + pointingThresh)
                            || (getJoint(SkeletonJoint.JointType.RELBOW).position.getZ(LengthUnit.METER)
                            > getJoint(SkeletonJoint.JointType.RSHOULDER).position.getZ(LengthUnit.METER) - pointingThresh))
                            && ((getJoint(SkeletonJoint.JointType.RWRIST).position.getZ(LengthUnit.METER)
                            < getJoint(SkeletonJoint.JointType.RELBOW).position.getZ(LengthUnit.METER) + pointingThresh)
                            || (getJoint(SkeletonJoint.JointType.RWRIST).position.getZ(LengthUnit.METER)
                            > getJoint(SkeletonJoint.JointType.RELBOW).position.getZ(LengthUnit.METER) - pointingThresh))) {
                        return PersonAttribute.Gesture.POINTING_RIGHT;
                    }
                }
            }
        } else if (hasJoint(SkeletonJoint.JointType.LSHOULDER)) {
            if (hasJoint(SkeletonJoint.JointType.LELBOW)) {
                if (hasJoint(SkeletonJoint.JointType.LWRIST)) {
                    if (((getJoint(SkeletonJoint.JointType.LELBOW).position.getZ(LengthUnit.METER)
                            < getJoint(SkeletonJoint.JointType.LSHOULDER).position.getZ(LengthUnit.METER) + pointingThresh)
                            || (getJoint(SkeletonJoint.JointType.LELBOW).position.getZ(LengthUnit.METER)
                            > getJoint(SkeletonJoint.JointType.LSHOULDER).position.getZ(LengthUnit.METER) - pointingThresh))
                            && ((getJoint(SkeletonJoint.JointType.LWRIST).position.getZ(LengthUnit.METER)
                            < getJoint(SkeletonJoint.JointType.LELBOW).position.getZ(LengthUnit.METER) + pointingThresh)
                            || (getJoint(SkeletonJoint.JointType.LWRIST).position.getZ(LengthUnit.METER)
                            > getJoint(SkeletonJoint.JointType.LELBOW).position.getZ(LengthUnit.METER) - pointingThresh))) {
                        return PersonAttribute.Gesture.POINTING_LEFT;
                    }
                }
            }
        }
        return PersonAttribute.Gesture.NEUTRAL;
    }

    /**
     * Return the lower bounds of the Head in picture coordinates. Use together
     * with getHeadUpperBounds()
     *
     * @return a Point2D where x and y are the lower bounds of the head in
     * picture coordinates
     */
    public Point2D getHeadLowerBound() {
        Point2D ret = new Point2D(0, 0, LengthUnit.MILLIMETER);
        Point2D center = getHeadCenterPictureCoordinates();
        Double dist = Double.MAX_VALUE;

        for (SkeletonJoint joint : jointList) {
            if (!hasJoint(joint.getJointType())) {
                continue;
            }
            if (joint.jointType != SkeletonJoint.JointType.LEAR
                    && joint.jointType != SkeletonJoint.JointType.REAR
                    && joint.jointType != SkeletonJoint.JointType.LEYE
                    && joint.jointType != SkeletonJoint.JointType.REYE
                    && joint.jointType != SkeletonJoint.JointType.NOSE) {
                continue;
            }
            Double distloop = Math.sqrt((joint.u * joint.u + joint.v * joint.v));
            if (distloop < dist) {
                dist = distloop;
            }
        }
        ret.setX((int) (center.getX(LengthUnit.MILLIMETER) - 1.1 * dist), LengthUnit.MILLIMETER);
        ret.setY((int) (center.getY(LengthUnit.MILLIMETER) - 1.2 * dist), LengthUnit.MILLIMETER);

        return ret;
    }

    /**
     *
     * Return the upper bounds of the Head in picture coordinates. Use together
     * with getHeadLowerBounds()
     *
     * @return a Point2D where x and y are the upper bounds of the head in
     * picture coordinates
     */
    public Point2D getHeadUpperBound() {
        Point2D ret = new Point2D(0, 0, LengthUnit.MILLIMETER);
        Point2D center = getHeadCenterPictureCoordinates();
        Double dist = Double.MAX_VALUE;

        for (SkeletonJoint joint : jointList) {
            if (!hasJoint(joint.getJointType())) {
                continue;
            }
            if (joint.jointType != SkeletonJoint.JointType.LEAR
                    || joint.jointType != SkeletonJoint.JointType.REAR
                    || joint.jointType != SkeletonJoint.JointType.LEYE
                    || joint.jointType != SkeletonJoint.JointType.REYE
                    || joint.jointType != SkeletonJoint.JointType.NOSE) {
                continue;
            }
            Double distloop = Math.sqrt((joint.u * joint.u + joint.v * joint.v));
            if (distloop < dist) {
                dist = distloop;
            }
        }
        ret.setX((int) (center.getX(LengthUnit.MILLIMETER) + 1.1 * dist), LengthUnit.MILLIMETER);
        ret.setY((int) (center.getY(LengthUnit.MILLIMETER) + 1.1 * dist), LengthUnit.MILLIMETER);

        return ret;
    }

    /**
     * Calculates the center of the head in picture coordinates.
     *
     * @return
     */
    public Point2D getHeadCenterPictureCoordinates() {
        Point2D ret = new Point2D(0, 0, LengthUnit.MILLIMETER);

        int counter = 0;
        for (SkeletonJoint joint : jointList) {
            if (!hasJoint(joint.getJointType())) {
                continue;
            }
            if (joint.jointType != SkeletonJoint.JointType.LEAR
                    && joint.jointType != SkeletonJoint.JointType.REAR
                    && joint.jointType != SkeletonJoint.JointType.LEYE
                    && joint.jointType != SkeletonJoint.JointType.REYE
                    && joint.jointType != SkeletonJoint.JointType.NOSE) {
                continue;
            }
            ret = ret.add(new Point2D(joint.u, joint.v, LengthUnit.MILLIMETER));
            counter++;
        }
        if (counter == 0) {
            return new Point2D(counter, counter, LengthUnit.MILLIMETER);
        }
        Point2D div = new Point2D(counter, counter, LengthUnit.MILLIMETER);
        ret = ret.div(div);
        ret.setX((int) (ret.getX(LengthUnit.MILLIMETER)), LengthUnit.MILLIMETER);
        ret.setY((int) (ret.getY(LengthUnit.MILLIMETER)), LengthUnit.MILLIMETER);
        return ret;
    }

    /**
     * Calculates the center of the shoulders in picture coordinates.
     *
     * @return
     */
    public Point2D getShoulderCenterPictureCoordinates() {
        Point2D ret = new Point2D(0, 0, LengthUnit.MILLIMETER);

        int counter = 0;
        for (SkeletonJoint joint : jointList) {
            if (!hasJoint(joint.getJointType())) {
                continue;
            }
            if (joint.jointType != SkeletonJoint.JointType.LSHOULDER
                    && joint.jointType != SkeletonJoint.JointType.RSHOULDER) {
                continue;
            }
            ret = ret.add(new Point2D(joint.u, joint.v, LengthUnit.MILLIMETER));
            counter++;
        }
        if (counter == 0) {
            return new Point2D(counter, counter, LengthUnit.MILLIMETER);
        }
        Point2D div = new Point2D(counter, counter, LengthUnit.MILLIMETER);
        ret = ret.div(div);
        ret.setX((int) (ret.getX(LengthUnit.MILLIMETER)), LengthUnit.MILLIMETER);
        ret.setY((int) (ret.getY(LengthUnit.MILLIMETER)), LengthUnit.MILLIMETER);
        return ret;
    }

    /**
     * Calculates the center of the torso in picture coordinates.
     *
     * @return
     */
    public Point2D getTorsoCenterPictureCoordinates() {
        Point2D ret = new Point2D(0, 0, LengthUnit.MILLIMETER);

        int counter = 0;
        for (SkeletonJoint joint : jointList) {
            if (!hasJoint(joint.getJointType())) {
                continue;
            }
            if (joint.jointType != SkeletonJoint.JointType.LHIP
                    && joint.jointType != SkeletonJoint.JointType.RHIP
                    && joint.jointType != SkeletonJoint.JointType.CHEST
                    && joint.jointType != SkeletonJoint.JointType.LSHOULDER
                    && joint.jointType != SkeletonJoint.JointType.RSHOULDER) {
                continue;
            }
            ret = ret.add(new Point2D(joint.u, joint.v, LengthUnit.MILLIMETER));
            counter++;
        }
        if (counter == 0) {
            return new Point2D(counter, counter, LengthUnit.MILLIMETER);
        }
        Point2D div = new Point2D(counter, counter, LengthUnit.MILLIMETER);
        ret = ret.div(div);
        ret.setX((int) (ret.getX(LengthUnit.MILLIMETER)), LengthUnit.MILLIMETER);
        ret.setY((int) (ret.getY(LengthUnit.MILLIMETER)), LengthUnit.MILLIMETER);
        return ret;
    }

    /**
     * Calculates the center of the hip in picture coordinates.
     *
     * @return
     */
    public Point2D getHipCenterPictureCoordinates() {
        Point2D ret = new Point2D(0, 0, LengthUnit.MILLIMETER);

        int counter = 0;
        for (SkeletonJoint joint : jointList) {
            if (!hasJoint(joint.getJointType())) {
                continue;
            }
            if (joint.jointType != SkeletonJoint.JointType.RHIP
                    && joint.jointType != SkeletonJoint.JointType.LHIP) {
                continue;
            }
            ret = ret.add(new Point2D(joint.u, joint.v, LengthUnit.MILLIMETER));
            counter++;
        }
        if (counter == 0) {
            return new Point2D(counter, counter, LengthUnit.MILLIMETER);
        }
        Point2D div = new Point2D(counter, counter, LengthUnit.MILLIMETER);
        ret = ret.div(div);
        ret.setX((int) (ret.getX(LengthUnit.MILLIMETER)), LengthUnit.MILLIMETER);
        ret.setY((int) (ret.getY(LengthUnit.MILLIMETER)), LengthUnit.MILLIMETER);
        return ret;
    }

    /**
     * Calculates the center of the legs in picture coordinates.
     *
     * @return
     */
    public Point2D getLegCenterPictureCoordinates() {
        Point2D ret = new Point2D(0, 0, LengthUnit.MILLIMETER);

        int counter = 0;
        for (SkeletonJoint joint : jointList) {
            if (!hasJoint(joint.getJointType())) {
                continue;
            }
            if (joint.jointType != SkeletonJoint.JointType.LHIP
                    && joint.jointType != SkeletonJoint.JointType.RHIP
                    && joint.jointType != SkeletonJoint.JointType.LANKLE
                    && joint.jointType != SkeletonJoint.JointType.RANKLE
                    && joint.jointType != SkeletonJoint.JointType.LKNEE
                    && joint.jointType != SkeletonJoint.JointType.RKNEE) {
                continue;
            }
            ret = ret.add(new Point2D(joint.u, joint.v, LengthUnit.MILLIMETER));
            counter++;
        }
        if (counter == 0) {
            return new Point2D(counter, counter, LengthUnit.MILLIMETER);
        }
        Point2D div = new Point2D(counter, counter, LengthUnit.MILLIMETER);
        ret = ret.div(div);
        ret.setX((int) (ret.getX(LengthUnit.MILLIMETER)), LengthUnit.MILLIMETER);
        ret.setY((int) (ret.getY(LengthUnit.MILLIMETER)), LengthUnit.MILLIMETER);
        return ret;
    }

    /**
     * Calculates the center of the knees in picture coordinates.
     *
     * @return
     */
    public Point2D getKneeCenterPictureCoordinates() {
        Point2D ret = new Point2D(0, 0, LengthUnit.MILLIMETER);

        int counter = 0;
        for (SkeletonJoint joint : jointList) {
            if (!hasJoint(joint.getJointType())) {
                continue;
            }
            if (joint.jointType != SkeletonJoint.JointType.LKNEE
                    && joint.jointType != SkeletonJoint.JointType.RKNEE) {
                continue;
            }
            ret = ret.add(new Point2D(joint.u, joint.v, LengthUnit.MILLIMETER));
            counter++;
        }
        if (counter == 0) {
            return new Point2D(counter, counter, LengthUnit.MILLIMETER);
        }
        Point2D div = new Point2D(counter, counter, LengthUnit.MILLIMETER);
        ret = ret.div(div);
        ret.setX((int) (ret.getX(LengthUnit.MILLIMETER)), LengthUnit.MILLIMETER);
        ret.setY((int) (ret.getY(LengthUnit.MILLIMETER)), LengthUnit.MILLIMETER);
        return ret;
    }

    /**
     * Calculates the center of the Ankles in picture coordinates.
     *
     * @return
     */
    public Point2D getAnkleCenterPictureCoordinates() {
        Point2D ret = new Point2D(0, 0, LengthUnit.MILLIMETER);

        int counter = 0;
        for (SkeletonJoint joint : jointList) {
            if (!hasJoint(joint.getJointType())) {
                continue;
            }
            if (joint.jointType != SkeletonJoint.JointType.LANKLE
                    && joint.jointType != SkeletonJoint.JointType.RANKLE) {
                continue;
            }
            ret = ret.add(new Point2D(joint.u, joint.v, LengthUnit.MILLIMETER));
            counter++;
        }
        if (counter == 0) {
            return new Point2D(counter, counter, LengthUnit.MILLIMETER);
        }
        Point2D div = new Point2D(counter, counter, LengthUnit.MILLIMETER);
        ret = ret.div(div);
        ret.setX((int) (ret.getX(LengthUnit.MILLIMETER)), LengthUnit.MILLIMETER);
        ret.setY((int) (ret.getY(LengthUnit.MILLIMETER)), LengthUnit.MILLIMETER);
        return ret;
    }

    /**
     * The center Position of the Head. Merely a centroid of the head joints.
     *
     * @return
     */
    public Point3D getHeadPositionRoomCoordinates() {
        Point3D ret = new Point3D(0, 0, 0, LengthUnit.MILLIMETER);

        int counter = 0;
        for (SkeletonJoint joint : jointList) {
            if (!hasJoint(joint.getJointType())) {
                continue;
            }
            if (joint.jointType != SkeletonJoint.JointType.LEAR
                    && joint.jointType != SkeletonJoint.JointType.REAR
                    && joint.jointType != SkeletonJoint.JointType.LEYE
                    && joint.jointType != SkeletonJoint.JointType.REYE
                    && joint.jointType != SkeletonJoint.JointType.NOSE) {
                continue;
            }
            if (Double.isNaN(joint.getJointPosition().getX(LengthUnit.MILLIMETER))) {
                continue;
            }
            ret = ret.add(joint.getJointPosition());
            counter++;
        }
        if (counter == 0) {
            return new Point3D(counter, counter, counter, LengthUnit.MILLIMETER);
        }
        Point3D div = new Point3D(counter, counter, counter, LengthUnit.MILLIMETER);
        ret = ret.div(div);

        return ret;
    }

    /**
     * The center Position of the Torso. Merely a centroid of the torso joints.
     *
     * @return
     */
    public Point3D getTorsoPositionRoomCoordinates() {
        Point3D ret = new Point3D(0, 0, 0, LengthUnit.MILLIMETER);

        int counter = 0;
        for (SkeletonJoint joint : jointList) {
            if (!hasJoint(joint.getJointType())) {
                continue;
            }
            if (joint.jointType != SkeletonJoint.JointType.LHIP
                    && joint.jointType != SkeletonJoint.JointType.RHIP
                    && joint.jointType != SkeletonJoint.JointType.CHEST
                    && joint.jointType != SkeletonJoint.JointType.LSHOULDER
                    && joint.jointType != SkeletonJoint.JointType.RSHOULDER) {
                continue;
            }
            if (Double.isNaN(joint.getJointPosition().getX(LengthUnit.MILLIMETER))) {
                continue;
            }
            ret = ret.add(joint.getJointPosition());
            counter++;
        }
        if (counter == 0) {
            return new Point3D(counter, counter, counter, LengthUnit.MILLIMETER);
        }
        Point3D div = new Point3D(counter, counter, counter, LengthUnit.MILLIMETER);
        ret = ret.div(div);

        return ret;
    }

    /**
     * The center Position of the Hip. Merely a centroid of the hip joints.
     *
     * @return
     */
    public Point3D getHipPositionRoomCoordinates() {
        Point3D ret = new Point3D(0, 0, 0, LengthUnit.MILLIMETER);

        int counter = 0;
        for (SkeletonJoint joint : jointList) {
            if (!hasJoint(joint.getJointType())) {
                continue;
            }
            if (joint.jointType != SkeletonJoint.JointType.LHIP
                    && joint.jointType != SkeletonJoint.JointType.RHIP) {
                continue;
            }
            if (Double.isNaN(joint.getJointPosition().getX(LengthUnit.MILLIMETER))) {
                continue;
            }
            ret = ret.add(joint.getJointPosition());
            counter++;
        }
        if (counter == 0) {
            return new Point3D(counter, counter, counter, LengthUnit.MILLIMETER);
        }
        Point3D div = new Point3D(counter, counter, counter, LengthUnit.MILLIMETER);
        ret = ret.div(div);

        return ret;
    }

    /**
     * The center Position of the Legs. Merely a centroid of the leg joints.
     *
     * @return
     */
    public Point3D getLegPositionRoomCoordinates() {
        Point3D ret = new Point3D(0, 0, 0, LengthUnit.MILLIMETER);

        int counter = 0;
        for (SkeletonJoint joint : jointList) {
            if (!hasJoint(joint.getJointType())) {
                continue;
            }
            if (joint.jointType != SkeletonJoint.JointType.LHIP
                    && joint.jointType != SkeletonJoint.JointType.RHIP
                    && joint.jointType != SkeletonJoint.JointType.LANKLE
                    && joint.jointType != SkeletonJoint.JointType.RANKLE
                    && joint.jointType != SkeletonJoint.JointType.LKNEE
                    && joint.jointType != SkeletonJoint.JointType.RKNEE) {
                continue;
            }
            if (Double.isNaN(joint.getJointPosition().getX(LengthUnit.MILLIMETER))) {
                continue;
            }
            ret = ret.add(joint.getJointPosition());
            counter++;
        }
        if (counter == 0) {
            return new Point3D(counter, counter, counter, LengthUnit.MILLIMETER);
        }
        Point3D div = new Point3D(counter, counter, counter, LengthUnit.MILLIMETER);
        ret = ret.div(div);

        return ret;
    }

    /**
     * Get the Confidence for this Person.
     *
     * @return
     */
    public double getConfidence() {
        double confidence = 0.0;
        for (SkeletonJoint joint : jointList) {
            if (!hasJoint(joint.getJointType())) {
                continue;
            }
            confidence += joint.getConfidence();
        }
        return confidence / 19;
    }

    public double getAverageConfidence() {
        double conf = 0.0;
        int counter = 0;
        for (SkeletonJoint joint : jointList) {
            if (!hasJoint(joint.getJointType())) {
                continue;
            }
            conf += joint.getConfidence();
            counter++;
        }
        return (counter == 0) ? 0 : conf / counter;
    }

    public Set<SkeletonJoint.JointType> getKnownJointTypes() {
        Set<SkeletonJoint.JointType> returnSet = new HashSet<>();
        for (SkeletonJoint joint : jointList) {
            returnSet.add(joint.getJointType());
        }
        return returnSet;
    }

    @Override
    public String toString() {
        String string = "BodySkeleton[";
        for (SkeletonJoint j : jointList) {
            string += "\n Joint[" + j.getJointType() + " Pos: " + j.getJointPosition().toString() + " Confidence: " + j.getConfidence() + " u: " + j.getU() + " v: " + j.getV() + " hasJoint: " + hasJoint(j.getJointType()) + "]";
        }
        string += "\n  averageConfidence: " + getAverageConfidence() + "\n  Confidence: " + getConfidence() + "\n  Posture: " + getPose() + "\n]";
        return string;
    }
}
