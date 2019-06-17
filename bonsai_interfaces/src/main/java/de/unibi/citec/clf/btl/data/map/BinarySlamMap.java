package de.unibi.citec.clf.btl.data.map;



import de.unibi.citec.clf.btl.data.common.Timestamp;
import de.unibi.citec.clf.btl.data.geometry.Point2D;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;

/**
 * A container for both the position and the map obtained from the SLAM
 * algorithm. The representation of the map is in the form of a probabilistic
 * occupancy grid: values of 0.0 means certainly occupied, 1.0 means a certainly
 * empty cell. Initially 0.5 means uncertainty.
 * 
 * Keep in mind that the occupancy grid is ordered like the first quadrant of a
 * mathematical plot (x to the right, y upwards, origin in the bottom left), NOT
 * like an image in computer graphics (x right, y down, origin at the the top
 * left).
 * 
 * @author dklotz
 * @author others (nkoester?, sebsche?)
 * @author jwienke
 * @author lziegler
 */
public class BinarySlamMap extends PositionData {

    private DynamicGridMap slamMap = new DynamicGridMap();

    /**
     * Creates a new {@link BinarySlamMap}.
     * 
     * @param width
     *            The width of the occupancy grid (positive!).
     * @param height
     *            The height of the occupancy grid (positive!).
     * @param map
     *            The linearized map.
     * @param x
     *            The robots X position (in world coordinates), as determined by
     *            Slam.
     * @param y
     *            The robots Y position (in world coordinates), as determined
     *            by Slam.
     * @param yaw
     *            The robots orientation, as determined by Slam.
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
     *            unit of the resolution value
     */
    public BinarySlamMap(int width, int height, float[] map, double x, double y, double yaw, Timestamp timestamp,
            int originX, int originY, double resolution, LengthUnit resolutionUnit) {

        super(x, y, yaw, timestamp, LengthUnit.METER, AngleUnit.RADIAN);

        this.slamMap = new DynamicGridMap(width, height, map, timestamp, originX, originY, resolution, resolutionUnit);
        slamMap.setGenerator(getGenerator());
    }

    /**
     * Creates a new {@link BinarySlamMap}.
     * 
     * @param gridMap
     *            The {@link DynamicGridMap} containing the slam map data.
     * @param x
     *            The robots X position (in world coordinates), as determined by
     *            Slam.
     * @param y
     *            The robots Y position (in world coordinates), as determinded
     *            by Slam.
     * @param yaw
     *            The robots orientation, as determined by Slam.
     * @param timestamp
     *            The timestamp of this measurement.
     * @param lu
     *            unit of x and y
     * @param au
     *            unit of yaw
     * 
     */
    public BinarySlamMap(DynamicGridMap gridMap, double x, double y, double yaw, Timestamp timestamp, LengthUnit lu,
            AngleUnit au) {

        super(x, y, yaw, timestamp, lu, au);

        this.slamMap = gridMap;
    }

    public BinarySlamMap() {
        super();
        slamMap.setGenerator(getGenerator());
        slamMap.setTimestamp(getTimestamp());
    }

    public BinarySlamMap(BinarySlamMap other) {
        super(other);
        slamMap.setGenerator(other.generator);
        slamMap.setTimestamp(new Timestamp(other.timestamp));
    }

    /**
     * converts idx to metric coordinates (x)
     * 
     * @param x
     *            the x index of the map
     * @param unit
     *            desired unit
     * @return the x coordinate in the desired unit
     */
    public double idx2x(int x, LengthUnit unit) {
        return slamMap.idx2x(x, unit);
    }

    /**
     * converts idx to metric coordinates (y)
     * 
     * @param y
     *            the y index of the map
     * @param unit
     *            desired unit
     * @return the y coordinate in the desired unit
     */
    public double idx2y(int y, LengthUnit unit) {
        return slamMap.idx2y(y, unit);
    }

    /**
     * converts metric coordinates to a map index (x)
     * 
     * @param x
     *            the x position that is queried
     * @param lu
     *            unit of the input value.
     * @return the X index of the map
     */
    public int x2idx(double x, LengthUnit lu) {
        return slamMap.x2idx(x, lu);
    }

    /**
     * converts metric coordinates to a map index (y)
     * 
     * @param y
     *            the y position that is queried
     * @param lu
     *            unit of the input value.
     * @return the Y index of the map
     */
    public int y2idx(double y, LengthUnit lu) {
        return slamMap.y2idx(y, lu);
    }

    /**
     * Get the occupancy grid. See the class comment ({@link BinarySlamMap}) for
     * a description of the format.
     * 
     * @return A two dimensional float array (never null).
     */
    public float[][] getSlamMap() {
        return slamMap.getGridMap();
    }

    /**
     * Sets the slam map as linear array using width and height to convert it to
     * a 2d map.
     * 
     * @param linearMap
     *            linear slam map array
     */
    public void setSlamMap(float[] linearMap) {
        this.slamMap.setGridMap(linearMap);
    }

    public void setDynamicGridMap(DynamicGridMap gridMap) {
        this.slamMap = gridMap;
    }

    public DynamicGridMap getDynamicGridMap() {
        return slamMap;
    }

    /**
     * Writes the SlamMap values [0,1] into a file.
     * 
     * @param filename
     *            the name of the file
     * @param separator
     *            the separator between the values
     * @return
     */
    public boolean writeSlamMapToFile(String filename, String separator) {
        return this.slamMap.writeGridMapToFile(filename, separator);
    }

    public int getWidth() {
        return this.slamMap.getWidth();
    }

    public void setWidth(int width) {
        this.slamMap.setWidth(width);
    }

    public int getHeight() {
        return this.slamMap.getHeight();
    }

    public void setHeight(int height) {
        this.slamMap.setHeight(height);
    }

    public int getOriginX() {
        return this.slamMap.getOriginX();
    }

    public void setOriginX(int originX) {
        this.slamMap.setOriginX(originX);
    }

    public int getOriginY() {
        return this.slamMap.getOriginY();
    }

    public void setOriginY(int originY) {
        this.slamMap.setOriginY(originY);
    }

    public double getResolution(LengthUnit u) {
        return this.slamMap.getResolution(u);
    }

    public void setResolution(double resolution, LengthUnit u) {
        this.slamMap.setResolution(resolution, u);
    }

    public String getUri() {
        return this.slamMap.getUri();
    }

    public void setUri(String uri) {
        this.slamMap.setUri(uri);
    }

    public float getValue(int i, int j) {
        return slamMap.getValue(i, j);
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
    public Point2D getPositionFromBin(int i, int j) {
        return slamMap.getPositionFromBin(i, j);
    }

    /**
     * Converts metric coordinates to a map index.
     * 
     * @param pos
     *            the position that is queried (in meters)
     * @return the x index of the map
     */
    public int getBinXFromPosition(PositionData pos) {
        return slamMap.getBinXFromPosition(pos);
    }

    /**
     * Converts metric coordinates to a map index.
     * 
     * @param pos
     *            the position that is queried (in meters)
     * @return the y index of the map
     */
    public int getBinYFromPosition(Point2D pos) {
        return slamMap.getBinYFromPosition(pos);
    }

    /**
     * Converts metric coordinates to a map index.
     * 
     * @param pos
     *            the position that is queried (in meters)
     * @return the x index of the map
     */
    public int getBinXFromPosition(Point2D pos) {
        return slamMap.getBinXFromPosition(pos);
    }

    /**
     * Converts metric coordinates to a map index.
     * 
     * @param pos
     *            the position that is queried (in meters)
     * @return the y index of the map
     */
    public int getBinYFromPosition(PositionData pos) {
        return slamMap.getBinYFromPosition(pos);
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
        return slamMap.getBinXFromPosition(x, unit);
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
        return slamMap.getBinYFromPosition(y, unit);
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public String toString() {
        return super.toString() + slamMap.toString();
    }
}
