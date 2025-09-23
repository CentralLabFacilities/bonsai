package de.unibi.citec.clf.btl.data.geometry;

import de.unibi.citec.clf.btl.units.LengthUnit;
import de.unibi.citec.clf.btl.units.UnitConverter;
import org.apache.log4j.Logger;

import java.util.Objects;

/**
 * This class represents a point in space by all 3 dimensions.
 *
 * @author lziegler
 */
public class Point3DStamped extends Point2DStamped {

    private final Logger logger = Logger.getLogger(Point3DStamped.class);

    protected double z;

    @Override
    public boolean equals(Object o) {
        // self check
        if (this == o) {
            return true;
        }
        // null check
        if (o == null) {
            return false;
        }
        // hash code
        if (o.hashCode() != this.hashCode()) {
            return false;
        }

        // type check and cast
        if (getClass() != o.getClass()) {
            return false;
        }

        Point3DStamped other = (Point3DStamped) o;

        if(Math.abs(getX(LengthUnit.METER) - other.getX(LengthUnit.METER)) > 1e-6*Math.abs(getX(LengthUnit.METER))){
            return false;
        }

        if(Math.abs(getY(LengthUnit.METER) - other.getY(LengthUnit.METER)) > 1e-6*Math.abs(getY(LengthUnit.METER))){
            return false;
        }

        if(Math.abs(getZ(LengthUnit.METER) - other.getZ(LengthUnit.METER)) > 1e-6*Math.abs(getZ(LengthUnit.METER))){
            return false;
        }

        return other.frameId.equals(frameId);
    }

    @Override
    public int hashCode() {
        int hash = 7;
        hash = 97 * hash + Long.hashCode(Double.doubleToLongBits(this.x));
        hash = 97 * hash + Long.hashCode(Double.doubleToLongBits(this.y));
        hash = 97 * hash + Long.hashCode(Double.doubleToLongBits(this.z));
        return hash;
    }

    @Override
    public String toString() {
        return "[" + getClass().getSimpleName() + " x=" + x + " y=" + y + " z=" + z;
    }

    /**
     * Creates instance.
     */
    public Point3DStamped() {
    }

    public Point3D toUnstamped() {
        return new Point3D(x,y,z,iLU);
    }

    public Point3DStamped(Point3DStamped p) {
        this.x = p.x;
        this.y = p.y;
        this.z = p.z;
        this.iLU = p.iLU;
        this.frameId = p.frameId;
        this.timestamp = p.timestamp;
    }

    public Point3DStamped(Point3D point, String frameId) {
        x = point.x;
        y = point.y;
        z = point.z;
        this.frameId = frameId;
    }

    /**
     * Creates instance.
     *
     * @param x first value
     * @param y second value
     * @param z third value
     * @param unit unit of the values
     */
    public Point3DStamped(double x, double y, double z, LengthUnit unit, String frame) {
        this.x = x;
        this.y = y;
        this.z = z;
        iLU = unit;
        frameId = frame;
    }

    public Point3DStamped(float x, float y, float z, String frame) {
        this.x = x;
        this.y = y;
        this.z = z;
        frameId = frame;
    }

    /**
     * Return a Point which will have the x, y and z coordinates of this and the given point added.
     *
     * @param p the other point
     * @return a new Point3D
     */
    public Point3DStamped add(Point3DStamped p) {
        if (!Objects.equals(p.frameId, frameId)) logger.warn("different frame ids");
        Point3DStamped point = new Point3DStamped(getX(iLU) + p.getX(iLU), getY(iLU) + p.getY(iLU), getZ(iLU) + p.getZ(iLU), iLU, frameId);
        return point;
    }

    /**
     * Return a Point which will have the x, y and z coordinates of this and the given point multiplied.
     *
     * @param p the other point
     * @return a new Point3D
     */
    public Point3DStamped mul(Point3DStamped p) {
        if(frameId != p.frameId) logger.warn("points in differrent frames");
        Point3DStamped point = new Point3DStamped(getX(iLU) * p.getX(iLU), getY(iLU) * p.getY(iLU), getZ(iLU) * p.getZ(iLU), iLU, frameId);
        return point;
    }

    /**
     * Return a Point which will have the x, y and z coordinates of this and the given point subtracted. Clarification:
     * The new point will have this points coordinates - the other points coordinates.
     *
     * @param p the other point
     * @return a new Point3D
     */
    public Point3DStamped sub(Point3DStamped p) {
        if(frameId != p.frameId) logger.warn("points in differrent frames");
        Point3DStamped point = new Point3DStamped(getX(iLU) - p.getX(iLU), getY(iLU) - p.getY(iLU), getZ(iLU) - p.getZ(iLU), iLU, frameId);
        return point;
    }

    /**
     * Return a Point which will have the x, y and z coordinates of this and the given point divided by each other.
     * Clarification: The new point will have this points coordinates / the other points coordinates.
     *
     * @param p the other point
     * @return a new Point3D
     */
    public Point3DStamped div(Point3DStamped p) {
        if(frameId != p.frameId) logger.warn("points in differrent frames");
        Point3DStamped point = new Point3DStamped(getX(iLU) / p.getX(iLU), getY(iLU) / p.getY(iLU), getZ(iLU) / p.getZ(iLU), iLU, frameId);
        return point;
    }
    
    public double distance(Point3DStamped center) {
        if(frameId != center.frameId) logger.warn("points in differrent frames");
        if (!this.iLU.equals(center.getOriginalLU())) {
            return Math.sqrt(Math.pow(this.x - center.getX(iLU), 2) + Math.pow(this.y - center.getY(iLU), 2) 
                    + Math.pow(this.z - center.getZ(iLU), 2));            
        }
        return Math.sqrt(Math.pow(this.x - center.x, 2) + Math.pow(this.y - center.y, 2)
                + Math.pow(this.z - center.z, 2));
    }
    
    public double getZ(LengthUnit unit) {
        return UnitConverter.convert(z, iLU, unit);
    }
    
    public void setZ(double z, LengthUnit unit) {
        this.z = UnitConverter.convert(z, unit, iLU);
    }
    
}
