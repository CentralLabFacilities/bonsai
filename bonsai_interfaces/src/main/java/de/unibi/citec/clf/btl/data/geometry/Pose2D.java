package de.unibi.citec.clf.btl.data.geometry;

import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.btl.data.common.Timestamp;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import de.unibi.citec.clf.btl.units.TimeUnit;
import de.unibi.citec.clf.btl.units.UnitConverter;

import java.util.Objects;

/**
 * Base class for all sensor results containing (robot/world) positions (X, Y, theta).
 */
public class Pose2D extends Point2DStamped {

    protected double yaw;
    protected AngleUnit iAU = AngleUnit.RADIAN;

    public enum ReferenceFrame {
        LOCAL(1, "base_link"),
        GLOBAL(2, "map");

        private final int referenceId;
        private final String referenceFrameName;


        ReferenceFrame(int value, String name) {
            this.referenceId = value;
            this.referenceFrameName = name;
        }

        public String getFrameName() {
            return referenceFrameName;
        }
        public static ReferenceFrame fromString(String referenceFrameName){
            for (ReferenceFrame frame : ReferenceFrame.values()) {
                if (frame.referenceFrameName.equalsIgnoreCase(referenceFrameName)) {
                    return frame;
                }
            }
            throw new IllegalArgumentException("No ReferenceFrame with name " + referenceFrameName + " found!");
        }

    }

    @Override
    public void setFrameId(String frameId){
        // to only allow frameid's that are based on the ReferenceFrame Enum convert once to and from it. (Exception will be raised if that doesn't work)
        ReferenceFrame frame = ReferenceFrame.fromString(frameId);
        String referenceName = frame.getFrameName();
        super.setFrameId(referenceName);
    }

    public void setFrameId(ReferenceFrame frame) {
        super.setFrameId(frame.getFrameName());
    }

    /**
     * Creates a position data object initialized with x, y and theta set to 0.0 and the timestamp set to the current
     * time.
     */
    public Pose2D() {
        this(0.0, 0.0, 0.0, Time.currentTimeMillis(), LengthUnit.METER,
                AngleUnit.RADIAN, TimeUnit.MILLISECONDS);
        setFrameId(ReferenceFrame.GLOBAL);
    }

    /**
     * Creates a new position data object initialized with the given values.
     *
     * @param x The X coordinate
     * @param y The Y coordinate
     * @param yaw The yaw/rotation
     * @param timestamp The timestamp of this position object [ms since 1970]
     * @param lU length unit of input values for x and y
     * @param aU angle unit of input values for yaw
     */
    public Pose2D(double x, double y, double yaw, Timestamp timestamp,
                  LengthUnit lU, AngleUnit aU) {
        this.x = UnitConverter.convert(x, lU, iLU);
        this.y = UnitConverter.convert(y, lU, iLU);
        this.yaw = UnitConverter.convert(yaw, aU, iAU);
        setTimestamp(timestamp);
        setFrameId(ReferenceFrame.GLOBAL);
    }

    public Pose2D(double x, double y, double yaw, long timestamp,
                  LengthUnit lU, AngleUnit aU, TimeUnit tU) {
        this.x = UnitConverter.convert(x, lU, iLU);
        this.y = UnitConverter.convert(y, lU, iLU);
        this.yaw = UnitConverter.convert(yaw, aU, iAU);
        setTimestamp(timestamp, tU);
        setFrameId(ReferenceFrame.GLOBAL);
    }
    
    public Pose2D(double x, double y, double yaw,
                  LengthUnit lU, AngleUnit aU) {
        this.x = UnitConverter.convert(x, lU, iLU);
        this.y = UnitConverter.convert(y, lU, iLU);
        this.yaw = UnitConverter.convert(yaw, aU, iAU);
        setFrameId(ReferenceFrame.GLOBAL);
    }


    /**
     * A copy-constructor constructs a new PositionData from the passed one.
     *
     * @param other
     */
    public Pose2D(Pose2D other) {
        super(other);
        this.yaw = other.yaw;
        setFrameId(other.getFrameId());
    }

    /**
     * Sets the current yaw.
     */
    public void setYaw(double Yaw, AngleUnit aU) {
        this.yaw = UnitConverter.convert(Yaw, aU, iAU);
    }

    /**
     * Distance to the other position in meter.
     *
     * @param otherPosition to calculate distance
     * @return distance between goals in meter
     * @param lU desired length unit
     */
    public double getDistance(Point2DStamped otherPosition, LengthUnit lU) {
        double dx = getX(lU) - otherPosition.getX(lU);
        double dy = getY(lU) - otherPosition.getY(lU);
        return Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
    }

    /**
     * Distance to the other position in meter.
     *
     * @param otherPosition to calculate distance
     * @return distance between goals in meter
     * @param lU desired length unit
     */
    public double getDistance(Pose2D otherPosition, LengthUnit lU) {
        double dx = getX(lU) - otherPosition.getX(lU);
        double dy = getY(lU) - otherPosition.getY(lU);
        return Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
    }

    public double getGlobalAngle(Pose2D otherPosition, AngleUnit unit) {
        LengthUnit lu = LengthUnit.METER;
        double dx = otherPosition.getX(lu) - getX(lu);
        double dy = otherPosition.getY(lu) - getY(lu);
        return UnitConverter
                .convert(Math.atan2(dy, dx), AngleUnit.RADIAN, unit);
    }

    public double getRelativeAngle(Pose2D otherPosition, AngleUnit unit) {
        AngleUnit au = AngleUnit.RADIAN;
        double angle = getGlobalAngle(otherPosition, au) - getYaw(au);
        angle = (angle + Math.PI) % (Math.PI * 2) - Math.PI;
        while (angle < -Math.PI) {
            angle += 2*Math.PI;
        }
        return UnitConverter.convert(angle, AngleUnit.RADIAN, unit);
    }

    /**
     * Returns the current yaw [rad] of the robot in world coordinates.
     *
     * Ranges from -PI to PI. 0.0 is returned of the robot is directed to the right. Positive values are returned if the
     * robot is directed up and negative values if the robot is directed down.
     *
     * @return The yaw as a double.
     *
     * @param aU desired angle unit
     */
    public double getYaw(AngleUnit aU) {
        return UnitConverter.convert(yaw, iAU, aU);
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Pose2D)) return false;
        if (!super.equals(o)) return false;
        Pose2D that = (Pose2D) o;
        return Double.compare(that.yaw, yaw) == 0 &&
                iAU == that.iAU;
    }

    @Override
    public int hashCode() {

        return Objects.hash(super.hashCode(), yaw, iAU);
    }

    protected boolean close(double d1, double d2) {
        return Math.abs(d1 - d2) < 0.0001;
    }

    @Override
    public String toString() {
        if (null != getFrameId()) {
            return "PositionData [X=" + x + ", Y=" + y + ", Yaw=" + yaw + ", iLU="
                    + iLU + ", iAU=" + iAU + ", frame=" + getFrameId() + "]";
        } else {
            return "PositionData [X=" + x + ", Y=" + y + ", Yaw=" + yaw + ", iLU="
                    + iLU + ", iAU=" + iAU + ", frame=null" + "]";
        }
    }

}
