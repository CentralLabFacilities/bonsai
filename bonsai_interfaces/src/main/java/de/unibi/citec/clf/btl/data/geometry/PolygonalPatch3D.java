package de.unibi.citec.clf.btl.data.geometry;

import org.apache.log4j.Logger;



import de.unibi.citec.clf.btl.Type;
import de.unibi.citec.clf.btl.data.vision3d.PointCloud;
import de.unibi.citec.clf.btl.tools.MathTools;
import de.unibi.citec.clf.btl.units.LengthUnit;

import java.util.Objects;

/**
 * @author lziegler
 *
 */
public class PolygonalPatch3D extends Type {
	
	private Pose3D base = new Pose3D();
	private PrecisePolygon border = new PrecisePolygon();
	
	Logger logger = Logger.getLogger(this.getClass());

	/**
	 * Create new polygonal patch.
	 */
	public PolygonalPatch3D() {
		super();
	}
	
	/**
	 * Create new polygonal patch.
	 * 
	 * @param other Other instance to copy
	 */
	public PolygonalPatch3D(PolygonalPatch3D other) {
		super(other);
		base = new Pose3D(other.base);
		border = new PrecisePolygon(other.border);
	}
	
	/**
	 * Create new polygonal patch.
	 * 
	 * @param base Base for construction of this patch
	 * @param border Border of this patch
	 */
	public PolygonalPatch3D(Pose3D base, PrecisePolygon border) {
		super();
		this.base = base;
		this.border = border;
	}

	public Pose3D getBase() {
		return base;
	}

	public void setBase(Pose3D base) {
		this.base = base;
	}

	public PrecisePolygon getBorder() {
		return border;
	}

	public void setBorder(PrecisePolygon border) {
		this.border = border;
	}
	
	public Point3D calculateCenterPoint() {
		LengthUnit m = LengthUnit.METER;
		
		Point2D centroid2D = border.getCentroid();
		
		logger.debug("2d centroid: " + centroid2D);
		
		Point3D center = new Point3D(centroid2D.getX(m), centroid2D.getY(m), 0, m, getFrameId());
		
		center = MathTools.applyAddition(center, base.getTranslation());
		center = MathTools.applyRotation(center, base.getRotation());
		
		return center;
	}
	
	public PointCloud calculatePointCloud3D() {
		LengthUnit m = LengthUnit.METER;
		PointCloud cloud = new PointCloud();
		for (Point2D p2d : border.getList()) {
			
			Point3D p3d = new Point3D(p2d.getX(m), p2d.getY(m), 0, m, getFrameId());
			
			p3d = MathTools.applyAddition(p3d, base.getTranslation());
			p3d = MathTools.applyRotation(p3d, base.getRotation());
			cloud.addPoint(p3d);
		}
		
		return cloud;
	}

	@Override
	public int hashCode() {
		final int prime = 31;
		int result = 1;
		result = prime * result + ((base == null) ? 0 : base.hashCode());
		result = prime * result + ((border == null) ? 0 : border.hashCode());
		return result;
	}

	@Override
	public boolean equals(Object o) {
		if (this == o) return true;
		if (!(o instanceof PolygonalPatch3D)) return false;
		if (!super.equals(o)) return false;
		PolygonalPatch3D that = (PolygonalPatch3D) o;
		return Objects.equals(base, that.base) &&
				Objects.equals(border, that.border);
	}

	@Override
	public String toString() {
		return "[" + getClass().getSimpleName() + " timestamp: " + getTimestamp()
				+ " Base: " + base + " Borders: " + border + " frame: " + getFrameId() + "]";
	}

}
