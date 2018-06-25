package de.unibi.citec.clf.btl.data.geometry;

import de.unibi.citec.clf.btl.Type;
import de.unibi.citec.clf.btl.units.LengthUnit;
import de.unibi.citec.clf.btl.units.UnitConverter;
import java.util.Objects;
import org.apache.log4j.Logger;

/**
 * This class represents a point in 2 dimensions.
 *
 * @author lziegler
 * @author rfeldhans
 */
public class Point2D extends Type {

    private final Logger logger = Logger.getLogger(Point2D.class);

    protected double x;
    protected double y;

    protected LengthUnit iLU = LengthUnit.METER;

    public LengthUnit getOriginalLU() {
        return iLU;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Point2D)) return false;
        if (!super.equals(o)) return false;
        Point2D point2D = (Point2D) o;
        return Double.compare(point2D.x, x) == 0 &&
                Double.compare(point2D.y, y) == 0 &&
                iLU == point2D.iLU;
    }

    @Override
    public int hashCode() {
        int hash = 7;
        hash = 97 * hash + (int) (Double.doubleToLongBits(this.x) ^ (Double.doubleToLongBits(this.x) >>> 32));
        hash = 97 * hash + (int) (Double.doubleToLongBits(this.y) ^ (Double.doubleToLongBits(this.y) >>> 32));
        hash = 97 * hash + Objects.hashCode(this.frameId);
        return hash;
    }

    @Override
    public String toString() {
        return "[" + getClass().getSimpleName() + " x=" + this.getX(LengthUnit.METER) + " y=" + this.getY(LengthUnit.METER)
                + " frame=" + getFrameId() + "]";
    }

    /**
     * Creates instance.
     */
    public Point2D() {
    }

    public Point2D(Point2D p) {
        this.x = p.x;
        this.y = p.y;
        this.frameId = p.frameId;
        this.iLU = p.iLU;
        this.timestamp = p.timestamp;
    }

    /**
     * Creates instance.
     *
     * @param x first value
     * @param y second value
     */
    public Point2D(double x, double y) {
        this.x = x;
        this.y = y;
    }

    /**
     * Creates instance.
     *
     * @param x first value
     * @param y second value
     * @param unit unit of the values
     */
    public Point2D(double x, double y, LengthUnit unit) {
        this.x = x;
        this.y = y;
        iLU = unit;
    }

    /**
     * Creates instance.
     *
     * @param x first value
     * @param y second value
     * @param unit unit of the values
     * @param frame coordinate frame
     */
    public Point2D(double x, double y, LengthUnit unit, String frame) {
        this(x, y, unit);
        frameId = frame;
    }

    public double distance(Point2D center) {
        if (!this.frameId.equals(center.frameId)) {
            logger.warn("distance in different frames: " + this.frameId + " and " + center.frameId);
        }
        if (!this.iLU.equals(center.getOriginalLU())) {
            return Math.sqrt(Math.pow(getX(iLU) - center.getX(iLU), 2) + Math.pow(getY(iLU) - center.getY(iLU), 2));
        }
        return Math.sqrt(Math.pow(this.x - center.x, 2) + Math.pow(this.y - center.y, 2));
    }

    public double getDistance(Point2D center, LengthUnit lu) {
        return UnitConverter.convert(distance(center), iLU, lu);
    }

    public double getX(LengthUnit unit) {
        return UnitConverter.convert(x, iLU, unit);
    }

    public void setX(double x, LengthUnit unit) {
        this.x = UnitConverter.convert(x, unit, iLU);
    }

    public double getY(LengthUnit unit) {
        return UnitConverter.convert(y, iLU, unit);
    }

    public void setY(double y, LengthUnit unit) {
        this.y = UnitConverter.convert(y, unit, iLU);
    }

    /**
     * Return a Point which will have the x, y and z coordinates of this and the given point added.
     *
     * @param p the other point
     * @return a new Point2D
     */
    public Point2D add(Point2D p) {
        Point2D point = new Point2D(getX(iLU) + p.getX(iLU), getY(iLU) + p.getY(iLU), iLU);
        return point;
    }

    /**
     * Return a Point which will have the x, y and z coordinates of this and the given point multiplied.
     *
     * @param p the other point
     * @return a new Point2D
     */
    public Point2D mul(Point2D p) {
        Point2D point = new Point2D(getX(iLU) * p.getX(iLU), getY(iLU) * p.getY(iLU), iLU);
        return point;
    }

    /**
     * Return a Point which will have the x, y and z coordinates of this and the given point subtracted. Clarification:
     * The new point will have this points coordinates - the other points coordinates.
     *
     * @param p the other point
     * @return a new Point2D
     */
    public Point2D sub(Point2D p) {
        Point2D point = new Point2D(getX(iLU) - p.getX(iLU), getY(iLU) - p.getY(iLU), iLU);
        return point;
    }

    /**
     * Return a Point which will have the x, y and z coordinates of this and the given point devided by each other.
     * Clarification: The new point will have this points coordinates / the other points coordinates.
     *
     * @param p the other point
     * @return a new Point2D
     */
    public Point2D div(Point2D p) {
        Point2D point = new Point2D(getX(iLU) / p.getX(iLU), getY(iLU) / p.getY(iLU), iLU);
        return point;
    }

    /**
     * Calculate the length of the vector this Point2D may describe.
     *
     * @param Lu the LengthUnit in which to give the result.
     * @return The length of the vector this Point2D describes.
     */
    public double getLength(LengthUnit Lu) {
        return getDistance(new Point2D(0, 0, Lu), Lu);
    }

    /**
     * Calculates the dot product between this point and the given one.
     *
     * @param p the point with which the dot product shall be calculated
     * @return The dot product, in this points Length unit
     */
    public double dotProduct(Point2D p) {
        return this.getX(iLU) * p.getX(iLU) + this.getY(iLU) * p.getY(iLU);
    }

    /**
     * Returns the angle in which an other Point2D lies.
     *
     * @param other the other Point
     * @return the angle to the other Point
     */
    public double getAngle(Point2D other) {
        return Math.atan2(other.getY(iLU) - getY(iLU), other.getX(iLU) - getX(iLU));
    }

}
