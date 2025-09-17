package de.unibi.citec.clf.btl.data.navigation;


import de.unibi.citec.clf.btl.StampedType;
import org.apache.log4j.Logger;

import de.unibi.citec.clf.btl.data.common.MicroTimestamp;
import de.unibi.citec.clf.btl.units.LengthUnit;
import de.unibi.citec.clf.btl.units.SpeedUnit;
import de.unibi.citec.clf.btl.units.UnitConverter;
import de.unibi.citec.clf.btl.data.geometry.Point2DStamped;

/**
 * This class is used to send direct linear drive commands (distance and speed).
 * TODO: rewrite maxAcceleration with Units
 *
 * @author lziegler, cklarhor
 */
public class DriveData extends StampedType {

    private static Logger logger = Logger.getLogger(DriveData.class);

    /**
     * drive speed in [m] default Value is NaN -> not set.
     */
    private double speed = Double.NaN;
    /**
     * max acceleration in [m²/s], default is NaN -> not set.
     */
    private double maxAcceleration = Double.NaN;

    private Point2DStamped direction = new Point2DStamped(1, 0, LengthUnit.METER); //todo: dirty hack

    private double distance;
    private MicroTimestamp readTime = new MicroTimestamp();

    public static SpeedUnit iSU = SpeedUnit.METER_PER_SEC;
    public static LengthUnit iLU = LengthUnit.METER;

    public DriveData() {
        super();
    }

    public DriveData(double distance, LengthUnit lengthUnit, double speed, SpeedUnit speedUnit) {
        super();
        setDistance(distance, lengthUnit);
        setSpeed(speed, speedUnit);
    }

    public DriveData(double distance, LengthUnit lengthUnit, double speed, SpeedUnit speedUnit, Point2DStamped direction) {
        super();
        setDirection(direction);
        setDistance(distance, lengthUnit);
        setSpeed(speed, speedUnit);
    }

    public Point2DStamped getDirection() {
        return direction;
    }

    public void setDirection(Point2DStamped direction) {
        this.direction = direction;
    }

    /**
     * @return the translational Speed[SpeedUnit]
     */
    public double getSpeed(SpeedUnit u) {
        return UnitConverter.convert(speed, iSU, u);
    }

    /**
     * Sets the translational speed.
     *
     * @param speedTranslation translational speed in [SpeedUnit]
     */
    public void setSpeed(double speedTranslation, SpeedUnit u) {
        this.speed = UnitConverter.convert(speedTranslation, u, iSU);
    }

    /**
     * @return true if speed is set.
     */
    public boolean hasSpeed() {
        return !Double.isNaN(this.speed);
    }

    /**
     * @return true if maxAcceleration is set.
     */
    public boolean hasMaxAcceleration() {
        return !Double.isNaN(this.maxAcceleration);
    }

    /**
     * sets maxAcceleration.
     *
     * @param maxAcceleration in [m²/s]
     */
    public void setMaxAcceleration(double maxAcceleration) {
        this.maxAcceleration = maxAcceleration;
    }

    /**
     * @return maxAcceleration in [m²/s].
     */
    public double getMaxAcceleration() {
        return this.maxAcceleration;
    }

    /**
     * @return the distance [LengthUnit].
     */
    public double getDistance(LengthUnit u) {
        return UnitConverter.convert(distance, iLU, u);
    }

    /**
     * Sets the distance.
     *
     * @param distance distance in [LengthUnit]
     */
    public void setDistance(double distance, LengthUnit u) {
        this.distance = UnitConverter.convert(distance, u, iLU);
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public String toString() {
        StringBuilder strb = new StringBuilder();
        strb.append("#DRIVE# ");
        strb.append("timestamp: " + getTimestamp() + "; ");
        strb.append("distance: " + distance + "; ");
        strb.append("speed: " + speed + "; ");
        strb.append("direction: " + direction + ";");
        return strb.toString();
    }

}
