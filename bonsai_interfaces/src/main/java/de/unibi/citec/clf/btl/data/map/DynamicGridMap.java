package de.unibi.citec.clf.btl.data.map;



import java.io.BufferedWriter;
import java.io.FileWriter;
import java.io.IOException;


import de.unibi.citec.clf.btl.StampedType;
import de.unibi.citec.clf.btl.data.common.Timestamp;
import de.unibi.citec.clf.btl.data.geometry.Point2DStamped;
import de.unibi.citec.clf.btl.data.geometry.Pose2D;
import de.unibi.citec.clf.btl.units.LengthUnit;
import de.unibi.citec.clf.btl.units.UnitConverter;

/**
 * A container for the map e.g. obtained from the SLAM algorithm. The
 * representation of the map is in the form of a probabilistic occupancy grid:
 * values of 0.0 means certainly occupied, 1.0 means a certainly empty cell.
 * Initially 0.5 means uncertainty.
 * 
 * Keep in mind that the occupancy grid is ordered like the first quadrant of a
 * mathematical plot (x to the right, y upwards, origin in the bottom left), NOT
 * like an image in computer graphics (x right, y down, origin at the the top
 * left).
 * 
 * @author dklotz
 * @author jwienke
 * @author lziegler
 */
@Deprecated
public class DynamicGridMap extends StampedType {

	private static final String ATTACHMENT_URI_ATTRIBUTE_NAME = "uri";
	private static final String PROPERTY_ELEMENT_NAME = "MAPPROPERTIES";
	private static final String WIDTH_ATTRIBUTE_NAME = "width";
	private static final String HEIGHT_ATTRIBUTE_NAME = "height";
	private static final String ORIGINX_ATTRIBUTE_NAME = "xorigin";
	private static final String ORIGINY_ATTRIBUTE_NAME = "yorigin";
	private static final String RESOLUTION_ATTRIBUTE_NAME = "resolution";

	private int width;
	private int height;

	private int originX;
	private int originY;

	private double resolution;

	private float[][] gridMap;

	private String uri;

	private static LengthUnit iLU = LengthUnit.METER;

	/**
	 * Creates a new {@link DynamicGridMap}.
	 * 
	 * @param width
	 *            The width of the occupancy grid (positive!).
	 * @param height
	 *            The height of the occupancy grid (positive!).
	 * @param map
	 *            The linearized map.
	 * @param timestamp
	 *            The timestamp of this measurement.
	 * @param originX
	 *            The grid x coordinate of the origin of the world coordinate
	 *            system.
	 * @param originY
	 *            The grid y coordinate of the origin of the world coordinate
	 *            system.
	 * @param resolution
	 *            size of grid cell in world unit
	 * @param resolutionUnit
	 *            length unit of the resolution value
	 */
	public DynamicGridMap(int width, int height, float[] map,
			Timestamp timestamp, int originX, int originY, double resolution,
			LengthUnit resolutionUnit) {

		this.height = height;
		this.width = width;

		this.originX = originX;
		this.originY = originY;
		this.resolution = UnitConverter
				.convert(resolution, resolutionUnit, iLU);

		this.gridMap = convertLinearTo2dMap(map, width, height);
	}

	/**
	 * Creates a new {@link DynamicGridMap}.
	 */
	public DynamicGridMap() {
	}

	/**
	 * converts idx to metric coordinates (x)
	 * 
	 * @param x
	 *            the x index of the map
	 * @param lu
	 *            Length unit of the returned value.
	 * @return the x coordinate in metres
	 */
	public double idx2x(int x, LengthUnit lu) {
		return (((double) x) - originX)
				* UnitConverter.convert(resolution, iLU, lu);
	}

	/**
	 * converts idx to metric coordinates (y)
	 * 
	 * @param y
	 *            the y index of the map
	 * @param lu
	 *            Length unit of the returned value.
	 * @return the y coordinate in metres
	 */
	public double idx2y(int y, LengthUnit lu) {
		return (((double) y) - originY)
				* UnitConverter.convert(resolution, iLU, lu);
	}

	/**
	 * converts metric coordinates to a map index (x)
	 * 
	 * @param x
	 *            the x position that is queried
	 * @param lu
	 *            Length unit of the input value.
	 * @return the X index of the map
	 */
	public int x2idx(double x, LengthUnit lu) {
		return (int) (UnitConverter.convert(x, lu, iLU) / resolution + originX);
	}

	/**
	 * converts metric coordinates to a map index (y)
	 * 
	 * @param y
	 *            the y position that is queried
	 * @param lu
	 *            Length unit of the input value.
	 * @return the Y index of the map
	 */
	public int y2idx(double y, LengthUnit lu) {
		return (int) (UnitConverter.convert(y, lu, iLU) / resolution + originY);
	}

	/**
	 * Creates a float array of the SlamMap.
	 * 
	 * @return a 2d float array
	 */
	private static float[][] convertLinearTo2dMap(float[] linearMap, int width,
			int height) {
		assert (linearMap.length == width * height);

		float[][] tempMap = new float[width][height];

		for (int x = 0; x < width; x++) {
			for (int y = 0; y < height; y++) {
				int linearIndex = (x * height) + y;
				tempMap[x][y] = linearMap[linearIndex];
			}
		}

		return tempMap;
	}

	/**
	 * Get the occupancy grid. See the class comment ({@link BinarySlamMap}) for
	 * a description of the format.
	 * 
	 * @return A two dimensional float array (never null).
	 */
	public float[][] getGridMap() {
		return gridMap;
	}

	/**
	 * Get the occupancy grid. See the class comment ({@link BinarySlamMap}) for
	 * a description of the format.
	 * 
	 * @return A one dimensional float array (never null).
	 */
	public float[] getLinearMap() {

		int width = 0;
		int height = 0;
		if (gridMap != null) {
			width = gridMap.length;
			if (width > 0) {
				height = gridMap[0].length;
			}
		}
		float[] tempMap = new float[width * height];

		for (int x = 0; x < width; x++) {
			for (int y = 0; y < height; y++) {
				int linearIndex = (x * height) + y;
				tempMap[linearIndex] = gridMap[x][y];
			}
		}

		return tempMap;
	}

	/**
	 * Get the occupancy grid. See the class comment ({@link BinarySlamMap}) for
	 * a description of the format.
	 * 
	 * @return A one dimensional float array (never null).
	 */
	public float[] getLinearMapRowWise() {

		int width = 0;
		int height = 0;
		if (gridMap != null) {
			width = gridMap.length;
			if (width > 0) {
				height = gridMap[0].length;
			}
		}
		float[] tempMap = new float[width * height];

		for (int x = 0; x < width; x++) {
			for (int y = 0; y < height; y++) {
				int linearIndex = x + y * width;
				tempMap[linearIndex] = gridMap[x][y];
			}
		}

		return tempMap;
	}

	/**
	 * Sets the slam map as linear array using width and height to convert it to
	 * a 2d map.
	 * 
	 * @param linearMap
	 *            linear slam map array
	 */
	public void setGridMap(float[] linearMap) {
		this.gridMap = convertLinearTo2dMap(linearMap, getWidth(), getHeight());
	}

	/**
	 * Sets the slam map as linear array using width and height to convert it to
	 * a 2d map.
	 * 
	 * @param map
	 *            2d slam map array
	 */
	public void setGridMap(float[][] map) {
		this.gridMap = map;
		if (gridMap != null) {
			width = gridMap.length;
			if (width > 0) {
				height = gridMap[0].length;
			}
		}
	}

	/**
	 * Writes the GridMap values [0,1] into a file.
	 * 
	 * @param filename
	 *            the name of the file
	 * @param separator
	 *            the separator between the values
	 * @return
	 */
	public boolean writeGridMapToFile(String filename, String separator) {
		try {
			// put everything in the file
			try (BufferedWriter out = new BufferedWriter(new FileWriter(filename))) {
				for (int j = 0; j < gridMap[1].length; j++) {
					for (float[] aGridMap : gridMap) {
						out.append(String.valueOf(aGridMap[j]) + separator);
					}
					out.append("\n");
				}
				out.flush();
				out.close();
			}
			return true;

		} catch (IOException e) {
			return false;
		}
	}

	public int getWidth() {
		return width;
	}

	public void setWidth(int width) {
		this.width = width;
	}

	public int getHeight() {
		return height;
	}

	public void setHeight(int height) {
		this.height = height;
	}

	public int getOriginX() {
		return originX;
	}

	public void setOriginX(int originX) {
		this.originX = originX;
	}

	public int getOriginY() {
		return originY;
	}

	public void setOriginY(int originY) {
		this.originY = originY;
	}

	public double getResolution(LengthUnit unit) {
		return UnitConverter.convert(resolution, iLU, unit);
	}

	public void setResolution(double resolution, LengthUnit unit) {
		this.resolution = UnitConverter.convert(resolution, unit, iLU);
	}

	public String getUri() {
		return uri;
	}

	public void setUri(String uri) {
		this.uri = uri;
	}

	public float getValue(int i, int j) {
		return gridMap[i][j];
	}

	/**
	 * Converts map indices to metric coordinates.
	 * 
	 * @param i
	 *            the x index of the map
	 * @param j
	 *            the y index of the map
	 * @return The corresponding position in meters.
	 */
	public Point2DStamped getPositionFromBin(int i, int j) {
		double x = idx2x(i, iLU);
		double y = idx2y(j,iLU);
		Point2DStamped p = new Point2DStamped(x, y, iLU, frameId);
		p.setTimestamp(getTimestamp());
		return p;
	}

	/**
	 * Converts metric coordinates to a map index.
	 * 
	 * @param pos
	 *            the position that is queried (in meters)
	 * @return the x index of the map
	 */
	public int getBinXFromPosition(Point2DStamped pos) {
		return x2idx(pos.getX(iLU),iLU);
	}

	/**
	 * Converts metric coordinates to a map index.
	 * 
	 * @param pos
	 *            the position that is queried (in meters)
	 * @return the y index of the map
	 */
	public int getBinYFromPosition(Point2DStamped pos) {
		return y2idx(pos.getY(iLU),iLU);
	}
	
	/**
	 * Converts metric coordinates to a map index.
	 * 
	 * @param pos
	 *            the position that is queried (in meters)
	 * @return the x index of the map
	 */
	public int getBinXFromPosition(Pose2D pos) {
		return x2idx(pos.getX(iLU),iLU);
	}

	/**
	 * Converts metric coordinates to a map index.
	 * 
	 * @param pos
	 *            the position that is queried (in meters)
	 * @return the y index of the map
	 */
	public int getBinYFromPosition(Pose2D pos) {
		return y2idx(pos.getY(iLU),iLU);
	}

	/**
	 * Converts metric coordinates to a map index.
	 * 
	 * @param x
	 *            the x position that is queried (in meters)
	 * @param unit
	 *            The length unit of the given value.
	 * @return the x index of the map
	 */
	public int getBinXFromPosition(double x, LengthUnit unit) {
		return x2idx(x, unit);
	}

	/**
	 * Converts metric coordinates to a map index.
	 * 
	 * @param y
	 *            the y position that is queried (in meters)
	 * @param unit
	 *            The length unit of the given value.
	 * @return the y index of the map
	 */
	public int getBinYFromPosition(double y, LengthUnit unit) {
		return y2idx(y, unit);
	}

	/**
	 * Resizes the current grid map. New areas are filled with value 0.5
	 * 
	 * @param width
	 *            New width of the map.
	 * @param height
	 *            New height of the map.
	 * @param originX
	 *            New x value of the map's origin.
	 * @param originY
	 *            New y value of the map's origin.
	 */
	public void resize(int width, int height, int originX, int originY) {

		float[][] newMap = new float[width][height];
		int oldMapMinX = originX - this.originX;
		int oldMapMaxX = originX + (this.width - this.originX) - 1;
		int oldMapMinY = originY - this.originY;
		int oldMapMaxY = originY + (this.height - this.originY) - 1;
		int offsetX = oldMapMinX;
		int offsetY = oldMapMinY;
		for (int x = 0; x < width; x++) {
			for (int y = 0; y < height; y++) {

				if (x < oldMapMinX || x > oldMapMaxX || y < oldMapMinY
						|| y > oldMapMaxY) {
					// if outside of old map initialize with 0.5
					newMap[x][y] = 0.5f;
				} else {
					// otherwise set old value to new position
					newMap[x][y] = gridMap[x - offsetX][y - offsetY];
				}
			}
		}
		gridMap = newMap;
		this.width = width;
		this.height = height;
		this.originX = originX;
		this.originY = originY;
	}

	/**
	 * {@inheritDoc}
	 */
	@Override
	public String toString() {
		return "[" + getClass().getSimpleName() + ": timestamp = "
				+ getTimestamp() + ", width = " + width + ", height = "
				+ height + ", originX = " + getOriginX() + ", originY = "
				+ getOriginY() + ", resolution = " + getResolution(iLU) + "]";
	}
}
