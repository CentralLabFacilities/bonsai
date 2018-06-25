package de.unibi.citec.clf.btl.data.vision3d;



import de.unibi.citec.clf.btl.Type;
import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.units.LengthUnit;
import de.unibi.citec.clf.btl.units.UnitConverter;

/**
 * This is the representation of an Point Cloud with grasping point and label.
 * 
 * @author plueckin
 */

public class PointCloudGrasping extends Type {

	public static final String LABEL_TAG = "LABEL";
	public static final String GRASPPNT_TAG = "GRASPING_POINT";
	
	public static String WIDTH_TAG = "WIDTH";
	public static String HEIGHT_TAG = "HEIGHT";
	public static String DEPTH_TAG = "DEPTH";

	public static LengthUnit iLU = LengthUnit.MILLIMETER;

	private String label;
	private Point3D grasppnt;
	private PointCloud convhull;

	protected double height;
	protected double width;
	protected double depth;
	
	public PointCloudGrasping() {
	}

	/**
	 * {@inheritDoc}
	 */
	@Override
	public boolean equals(Object obj) {
		try {
			if (!(obj instanceof PointCloudGrasping))
				return false;

			PointCloudGrasping other = (PointCloudGrasping) obj;

			return other.getConvexhull().equals(convhull)
					&& other.getGraspPoint().equals(grasppnt)
					&& other.getLabel().equals(label)
            		&& other.getHeight(iLU) == getHeight(iLU)
            		&& other.getDepth(iLU) == getDepth(iLU)
            		&& other.getWidth(iLU) == getWidth(iLU);
		} catch (Exception e) {
			return false;
		}
	}

	/**
	 * {@inheritDoc}
	 */
	@Override
	public String toString() {
		StringBuilder strb = new StringBuilder();
		strb.append(getClass().getSimpleName() + "; ");
		strb.append("timestamp: " + getTimestamp() + "; ");
		strb.append("label: " + label + "; ");
		strb.append("height=" + height + "; ");
		strb.append("width=" + width + "; ");
		strb.append("depth=" + depth + "; ");
		strb.append("grasppoint: " + grasppnt.getX(iLU) + ", "
				+ grasppnt.getY(iLU) + ", " + grasppnt.getZ(iLU) + "; ");
		strb.append("point_cloud: " + convhull.toString() + ";");
		return strb.toString();
	}

	public void setLabel(String label) {
		this.label = label;
	}

	public String getLabel() {
		return label;
	}

	public void setConvexhull(PointCloud in_cloud) {
		this.convhull = in_cloud;
	}

	public PointCloud getConvexhull() {
		return convhull;
	}

	public void setGraspPoint(double x, double y, double z) {
		this.grasppnt = new Point3D(x, y, z, iLU);
	}

	public Point3D getGraspPoint() {
		return grasppnt;
	}
	
	public double getWidth(LengthUnit unit) {
		return UnitConverter.convert(width, iLU, unit);
	}

	public void setWidth(double width, LengthUnit unit) {
		this.width = UnitConverter.convert(width, unit, iLU);
	}

	public double getHeight(LengthUnit unit) {
		return UnitConverter.convert(height, iLU, unit);
	}

	public void setHeight(double height, LengthUnit unit) {
		this.height = UnitConverter.convert(height, unit, iLU);
	}

	public double getDepth(LengthUnit unit) {
		return UnitConverter.convert(depth, iLU, unit);
	}

	public void setDepth(double depth, LengthUnit unit) {
		this.depth = UnitConverter.convert(depth, unit, iLU);
	}

}
