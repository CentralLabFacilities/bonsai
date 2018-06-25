package de.unibi.citec.clf.btl.data.geometry;



import java.util.Iterator;
import java.util.LinkedList;
import java.util.List;





import de.unibi.citec.clf.btl.Type;
import de.unibi.citec.clf.btl.units.LengthUnit;

/**
 * This is a serializable and iterable polygon type. It is similar to
 * nothing, but has a double precision and 3D coordinates.
 * 
 * TODO: implement utility functions like those in {@link java.awt.Polygon}.
 * 
 * @author lziegler
 */
public class PrecisePolygon3D extends Type implements Iterable<Point3D> {

	/**
	 * List of polygon points.
	 */
	protected List<Point3D> list = new LinkedList<>();

	public PrecisePolygon3D(PrecisePolygon3D poly) {
		LengthUnit unit = LengthUnit.MILLIMETER;
		for (Point3D point : poly) {
			list.add(new Point3D(point.getX(unit), point.getY(unit), point
					.getZ(unit), unit));
		}
	}

	public PrecisePolygon3D() {
	}

	public void addPoint(double x, double y, double z, LengthUnit unit) {
		list.add(new Point3D(x, y, z, unit));
	}

	/**
	 * Adds a {@link Point3D} to the polygon.
	 * 
	 * @param p
	 *            The {@link Point3D} instance to add.
	 */
	public void addPoint(Point3D point) {
		list.add(point);
	}

	/**
	 * {@inheritDoc}
	 */
	@Override
	public String toString() {
		String info = "[PRECISEPOLYGON3D";
		for (Point3D p : list) {
			info += " " + p.toString();
		}
		info += "]";
		return info;
	}

	/**
	 * {@inheritDoc}
	 */
	@Override
	public boolean equals(Object obj) {
		try {
			if (!(obj instanceof PrecisePolygon3D))
				return false;

			PrecisePolygon3D other = (PrecisePolygon3D) obj;

			return other.list.equals(list);
		} catch (Exception e) {
			return false;
		}
	}

	/**
	 * Returns the centroid of this polygon. Implemented as arithmetic mean
	 * value of all polygon points.
	 * 
	 * @return The centroid of this polygon.
	 */
	public Point3D getCentroid() {

		double x = 0;
		double y = 0;
		double z = 0;
		int count = 0;
		for (Point3D p : list) {
			x += p.getX(LengthUnit.MILLIMETER);
			y += p.getY(LengthUnit.MILLIMETER);
			z += p.getZ(LengthUnit.MILLIMETER);
			count++;
		}

		if (count == 0) {
			return null;
		} else {
			return new Point3D(x / (double) count, y / (double) count, z
					/ (double) count, LengthUnit.MILLIMETER);
		}
	}

	public double getMinX(LengthUnit unit) {
		double minX = Double.POSITIVE_INFINITY;
		for (Point3D point : list) {
			double x = point.getX(unit);
			if (minX > x) {
				minX = x;
			}
		}
		return minX;
	}

	public double getMaxX(LengthUnit unit) {
		double maxX = Double.NEGATIVE_INFINITY;
		for (Point3D point : list) {
			double x = point.getX(unit);
			if (maxX < x) {
				maxX = x;
			}
		}
		return maxX;
	}

	public double getMinY(LengthUnit unit) {
		double minY = Double.POSITIVE_INFINITY;
		for (Point3D point : list) {
			double y = point.getY(unit);
			if (minY > y) {
				minY = y;
			}
		}
		return minY;
	}

	public double getMaxY(LengthUnit unit) {
		double maxY = Double.NEGATIVE_INFINITY;
		for (Point3D point : list) {
			double y = point.getY(unit);
			if (maxY < y) {
				maxY = y;
			}
		}
		return maxY;
	}

	public double getMinZ(LengthUnit unit) {
		double minZ = Double.POSITIVE_INFINITY;
		for (Point3D point : list) {
			double z = point.getZ(unit);
			if (minZ > z) {
				minZ = z;
			}
		}
		return minZ;
	}

	public double getMaxZ(LengthUnit unit) {
		double maxZ = Double.NEGATIVE_INFINITY;
		for (Point3D point : list) {
			double z = point.getZ(unit);
			if (maxZ < z) {
				maxZ = z;
			}
		}
		return maxZ;
	}

	public void move(double dx, double dy, double dz, LengthUnit unit) {
		for (Point3D point : list) {
			point.setX(point.getX(unit) + dx, unit);
			point.setY(point.getY(unit) + dy, unit);
			point.setZ(point.getZ(unit) + dz, unit);
		}
	}

	/**
	 * {@inheritDoc}
	 */
	@Override
	public Iterator<Point3D> iterator() {
		return list.iterator();
	}
}
