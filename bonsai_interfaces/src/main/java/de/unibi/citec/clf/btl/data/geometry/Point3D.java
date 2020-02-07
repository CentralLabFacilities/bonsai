package de.unibi.citec.clf.btl.data.geometry;

import de.unibi.citec.clf.btl.units.LengthUnit;
import de.unibi.citec.clf.btl.units.UnitConverter;
import java.util.Objects;
import org.apache.log4j.Logger;

/**
 * This class represents a point in space by all 3 dimensions.
 *
 * @author lziegler
 */
public class Point3D extends Point2D {
    
    private final Logger logger = Logger.getLogger(Point3D.class);
    
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
        
        Point3D other = (Point3D) o;

        if(Math.abs(getX(LengthUnit.METER) - other.getX(LengthUnit.METER)) > 1e-6*Math.abs(getX(LengthUnit.METER))){
            return false;
        }

        if(Math.abs(getY(LengthUnit.METER) - other.getY(LengthUnit.METER)) > 1e-6*Math.abs(getY(LengthUnit.METER))){
            return false;
        }

        if(Math.abs(getZ(LengthUnit.METER) - other.getZ(LengthUnit.METER)) > 1e-6*Math.abs(getZ(LengthUnit.METER))){
            return false;
        }
        
        return Objects.equals(other.frameId, frameId);
    }
    
    @Override
    public int hashCode() {
        int hash = 7;
        hash = 97 * hash + (int) (Double.doubleToLongBits(this.x) ^ (Double.doubleToLongBits(this.x) >>> 32));
        hash = 97 * hash + (int) (Double.doubleToLongBits(this.y) ^ (Double.doubleToLongBits(this.y) >>> 32));
        hash = 97 * hash + (int) (Double.doubleToLongBits(this.z) ^ (Double.doubleToLongBits(this.z) >>> 32));
        hash = 97 * hash + Objects.hashCode(this.frameId);
        return hash;
    }
    
    @Override
    public String toString() {
        return "[" + getClass().getSimpleName() + " x=" + x + " y=" + y + " z=" + z
                + " frame=" + getFrameId() + "]";
    }

    /**
     * Creates instance.
     */
    public Point3D() {
    }
    
    public Point3D(Point3D p) {
        this.x = p.x;
        this.y = p.y;
        this.z = p.z;
        this.frameId = p.frameId;
        this.iLU = p.iLU;
        this.timestamp = p.timestamp;
    }

    /**
     * Creates instance.
     *
     * @param x first value
     * @param y second value
     * @param z third value
     * @param unit unit of the values
     */
    public Point3D(double x, double y, double z, LengthUnit unit) {
        this.x = x;
        this.y = y;
        this.z = z;
        iLU = unit;
    }

    public Point3D(float x, float y, float z) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    /**
     * Creates instance.
     *
     * @param x first value
     * @param y second value
     * @param z third value
     * @param unit unit of the values
     * @param frame coordinate frame
     */
    public Point3D(double x, double y, double z, LengthUnit unit, String frame) {
        this(x, y, z, unit);
        frameId = frame;
    }

    /**
     * Return a Point which will have the x, y and z coordinates of this and the given point added.
     *
     * @param p the other point
     * @return a new Point3D
     */
    public Point3D add(Point3D p) {
        Point3D point = new Point3D(getX(iLU) + p.getX(iLU), getY(iLU) + p.getY(iLU), getZ(iLU) + p.getZ(iLU), iLU);
        return point;
    }

    /**
     * Return a Point which will have the x, y and z coordinates of this and the given point multiplied.
     *
     * @param p the other point
     * @return a new Point3D
     */
    public Point3D mul(Point3D p) {
        Point3D point = new Point3D(getX(iLU) * p.getX(iLU), getY(iLU) * p.getY(iLU), getZ(iLU) * p.getZ(iLU), iLU);
        return point;
    }

    /**
     * Return a Point which will have the x, y and z coordinates of this and the given point subtracted. Clarification:
     * The new point will have this points coordinates - the other points coordinates.
     *
     * @param p the other point
     * @return a new Point3D
     */
    public Point3D sub(Point3D p) {
        Point3D point = new Point3D(getX(iLU) - p.getX(iLU), getY(iLU) - p.getY(iLU), getZ(iLU) - p.getZ(iLU), iLU);
        return point;
    }

    /**
     * Return a Point which will have the x, y and z coordinates of this and the given point devided by each other.
     * Clarification: The new point will have this points coordinates / the other points coordinates.
     *
     * @param p the other point
     * @return a new Point3D
     */
    public Point3D div(Point3D p) {
        Point3D point = new Point3D(getX(iLU) / p.getX(iLU), getY(iLU) / p.getY(iLU), getZ(iLU) / p.getZ(iLU), iLU);
        return point;
    }
    
    public double distance(Point3D center) {
        if (!this.frameId.equals(center.frameId)) {
            logger.warn("distance in different frames: " + this.frameId + " and " + center.frameId);
        }
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
