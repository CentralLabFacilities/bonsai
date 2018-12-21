package de.unibi.citec.clf.bonsai.strategies.exploration;



import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.bonsai.core.SensorListener;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.bonsai.util.Pair;
import de.unibi.citec.clf.bonsai.util.slam.SlamTools;
import de.unibi.citec.clf.bonsai.util.slam.SlamTools.Edge;
import de.unibi.citec.clf.bonsai.util.slam.SlamTools.Node;
import de.unibi.citec.clf.btl.data.geometry.Point2D;
import de.unibi.citec.clf.btl.data.map.Annotation;
import de.unibi.citec.clf.btl.data.map.BinarySlamMap;
import de.unibi.citec.clf.btl.data.map.DynamicGridMap;
import de.unibi.citec.clf.btl.data.navigation.NavigationGoalData;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import de.unibi.citec.clf.btl.units.UnitConverter;
import edu.uci.ics.jung.graph.Graph;
import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.Graphics;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.AffineTransform;
import java.awt.image.BufferedImage;
import java.io.IOException;
import static java.lang.Math.cos;
import static java.lang.Math.sin;
import java.util.Collections;
import java.util.Iterator;
import java.util.LinkedList;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.Vector;
import javax.swing.JFrame;
import javax.swing.JPanel;
import org.apache.log4j.Logger;

/**
 * This class implements an exploration strategy derived from an approach called
 * "frontier-based exploration". The implementation is based on the algorithm
 * described in "A Frontier-Based Approach for Autonomous Exploration" by Brian
 * Yamauchi.
 * http://www.cs.cmu.edu/~motionplanning/papers/sbp_papers/integrated2/
 * yamauchi_frontier_explor.pdf
 * 
 * @author lziegler
 */
public class FrontierBasedExploration implements ExplorationStrategy {

	private static final String MSEC = " msec";
	private static final double YAW_TOLERANCE_FACTOR = 0.125;
	private static final double YAW_TOLERANCE = Math.PI * YAW_TOLERANCE_FACTOR;
	private static final int DEBUG_HEIGHT = 500;
	private static final int DEBUG_WIDTH = 500;
	private static final int ORIENTATION_SEGMENTS = 8;
	private static final double SLAM_MIDDLE_VALUE = 0.5;
	private static final double SLAM_VALUE_TOLERANCE = 0.001;
	private static final int INITIAL_TIMEOUT = 300;

	/**
	 * Occupancy definitions.
	 */
	private enum Occupancy {
		UNKNOWN, OBSTACLE, CLEAR
	}

	private Logger logger = Logger.getLogger(this.getClass());

	private DynamicGridMap currentSlamMap;
	private DynamicGridMap currentDataMap;
	private DynamicGridMap oldDataMap;
	private Object slamLock = new Object();
	private Random random = new Random(Time.currentTimeMillis());
	private List<Pair<Integer>> frontiers = new LinkedList<>();
	private Vector<Double> distancesForMean = new Vector<>();
	private double meanDistance = 0;

	// DEBUGGING
	private boolean debugMode = false;
	private JFrame debugFrame0;
	private MapPanel debugPanel0;
	private JFrame debugFrame1;
	private MapPanel debugPanel1;

	// Options
	private Options options;

	/**
	 * Constructs a new instance of this strategy.
	 * 
	 * @param slamSensor
	 *            A sensor receiving a slam map.
	 * @param options
	 *            An object containing all options for this strategy. See
	 *            {@link Options} for further details.
	 */
	public FrontierBasedExploration(Sensor<BinarySlamMap> slamSensor,
			Options options) {
		this(slamSensor, null, options);
	}

	/**
	 * Constructs a new instance of this strategy. This variant searches an a
	 * different map for frontier points than the slam map. Slam map is only
	 * used to determine if the frontier is not near obstacle and is reachable.
	 * 
	 * @param slamSensor
	 *            A sensor receiving a slam map.
	 * @param frontierSensor
	 *            A sensor receiving the map that is used to generate frontier
	 *            points.
	 * @param options
	 *            An object containing all options for this strategy. See
	 *            {@link Options} for further details.
	 */
	public FrontierBasedExploration(Sensor<BinarySlamMap> slamSensor,
			Sensor<DynamicGridMap> frontierSensor, Options options) {

		this.options = options;

		try {
			currentSlamMap = slamSensor.readLast(INITIAL_TIMEOUT)
					.getDynamicGridMap();
			if (frontierSensor != null) {
				currentDataMap = frontierSensor.readLast(INITIAL_TIMEOUT);
			}
		} catch (IOException e) {
			logger.warn("IO error while fetching initial slam map.");
			logger.debug(e);
		} catch (InterruptedException e) {
			logger.warn("Interrupted while fetching initial slam map.");
			logger.debug(e);
		}
		if (currentSlamMap == null) {
			logger.warn("Getting initial slam map timed out!");
		}
		slamSensor.addSensorListener(newData -> {
            synchronized (slamLock) {
                currentSlamMap = newData.getDynamicGridMap();
            }
        });
		if (frontierSensor != null) {
			frontierSensor
					.addSensorListener(newData -> {
                        synchronized (slamLock) {
                            currentDataMap = newData;
                        }
                    });
		}
	}

	/**
	 * This enables the debug behavior of this class.
	 */
	public void enableDebugMode() {
		debugMode = true;
	}

	/**
	 * Calculates a new navigation goal depending on the robot's current
	 * position. Returns the current position as a goal, if no frontier was
	 * found.
	 * 
	 * @param currentPosition
	 *            The current position of the robot.
	 * @return A reasonable new goal or the current position as a goal, if no
	 *         frontier was found.
	 * @throws NoGoalFoundException
	 *             Is thrown if no further goal was found.
	 */
	@Override
	public synchronized NavigationGoalData getNextGoal(
			PositionData currentPosition) throws NoGoalFoundException {

		// do calculation
		long start = Time.currentTimeMillis();
		updateFrontiers();
		long stop = Time.currentTimeMillis();
		logger.debug("update frontiers took " + (stop - start) + MSEC);

		start = Time.currentTimeMillis();
		NavigationGoalData goal = chooseGoal(frontiers, currentPosition);
		stop = Time.currentTimeMillis();
		logger.debug("choose goal took " + (stop - start) + MSEC);

		start = Time.currentTimeMillis();
		goal = chooseOrientation(goal);
		stop = Time.currentTimeMillis();
		logger.debug("choose orientation took " + (stop - start) + MSEC);

		debug(frontiers, goal, currentPosition);

		return goal;
	}

	/**
	 * Calculates a new navigation goal depending on the robot's current
	 * position. Returns the current position as a goal, if no frontier was
	 * found.
	 * 
	 * @param currentPosition
	 *            The current position of the robot.
	 * @param region
	 *            The region, that should be explored.
	 * @return A reasonable new goal or the current position as a goal, if no
	 *         frontier was found.
	 * @throws NoGoalFoundException
	 *             Is thrown if no further goal was found.
	 */
	@Override
	public synchronized NavigationGoalData getNextGoal(
			PositionData currentPosition, Annotation region)
			throws NoGoalFoundException {

		// do calculation
		updateFrontiers();

		// only take frontiers in region
		Vector<Pair<Integer>> frontiersInRegion = new Vector<>();

		for (Pair<Integer> frontier : frontiers) {
			synchronized (slamLock) {
				if (currentSlamMap != null) {
					int i = frontier.getFirst().intValue();
					int j = frontier.getSecond().intValue();
					Point2D pos = currentSlamMap.getPositionFromBin(i, j);

					if (region.getPolygon().contains(pos.getX(LengthUnit.METER),
							pos.getY(LengthUnit.METER), LengthUnit.METER)) {
						frontiersInRegion.add(frontier);
					}
				}

			}
		}

		NavigationGoalData goal = chooseGoal(frontiersInRegion, currentPosition);
		goal = chooseOrientation(goal);

		debug(frontiersInRegion, goal, currentPosition);

		return goal;
	}

	private NavigationGoalData chooseGoal(List<Pair<Integer>> frontiers,
			PositionData currentPosition) throws NoGoalFoundException {

		Pair<Integer> chosen = null;

		switch (options.variant) {
		case RANDOM:
			chosen = frontiers.get(random.nextInt(frontiers.size()));
			break;

		case SHORTEST_PATH:

			synchronized (slamLock) {
				if (currentSlamMap == null) {
					logger.warn("slammap is null");
					break;
				}
				try {
					// calculate shortest path using dijkstra algorithm
					long start = Time.currentTimeMillis();
					Graph<Node, Edge> graph = SlamTools
							.generateNavigationGraph(currentSlamMap,
									options.binsPerNodeInPathPlanning);
					long stop = Time.currentTimeMillis();
					logger.debug("generate nav graph took " + (stop - start)
							+ MSEC);

					int x = currentSlamMap.getBinXFromPosition(currentPosition);
					int y = currentSlamMap.getBinYFromPosition(currentPosition);

					start = Time.currentTimeMillis();
					Map<Node, Number> distances = SlamTools.getDistanceMap(
							graph, x, y);
					stop = Time.currentTimeMillis();
					logger.debug("generate dist map took " + (stop - start)
							+ MSEC);

					start = Time.currentTimeMillis();
					double minDistance = Double.MAX_VALUE;
					distancesForMean.clear();
					boolean foundReachableFrontier = false;

					for (Pair<Integer> frontier : frontiers) {
						int i = frontier.getFirst().intValue()
								+ currentSlamMap.getOriginX();
						int j = frontier.getSecond().intValue()
								+ currentSlamMap.getOriginY();
						double distance = SlamTools.getDistance(graph,
								distances, i, j);

						// save mean distance and convert to meter
						distancesForMean.add(distance
								* (double) options.binsPerNodeInPathPlanning
								* currentSlamMap
										.getResolution(LengthUnit.METER));

						if (distance < minDistance) {
							foundReachableFrontier = true;
							minDistance = distance;
							chosen = frontier;
						}
					}
					stop = Time.currentTimeMillis();
					logger.debug("find shortest dist took " + (stop - start)
							+ MSEC);
					calculateMeanDistance();
					if (!foundReachableFrontier) {
						logger.warn("Found no reachable frontier!");
						throw new NoGoalFoundException();
					}
				} catch (IllegalArgumentException e) {
					logger.error("calculating shortest path threw "
							+ "IllegalArgumentException");
					logger.debug(e);
				}
			}
			break;

		case NEAREST:
		default:
			double minDistance = Double.MAX_VALUE;
			synchronized (slamLock) {
				// find nearest frontier regarding beeline
				for (Pair<Integer> frontier : frontiers) {
					int i = frontier.getFirst().intValue()
							+ currentSlamMap.getOriginX();
					int j = frontier.getSecond().intValue()
							+ currentSlamMap.getOriginY();
					Point2D pos = currentSlamMap.getPositionFromBin(i, j);
					double distance = currentPosition.getDistance(pos,
							LengthUnit.METER);
					if (distance < minDistance) {
						minDistance = distance;
						chosen = frontier;
					}
				}
			}
			break;
		}

		// generate navigation goal
		NavigationGoalData chosenGoal = null;
		if (chosen == null) {
			chosenGoal = new NavigationGoalData(currentPosition);
		} else {
			synchronized (slamLock) {
				int i = chosen.getFirst().intValue()
						+ currentSlamMap.getOriginX();
				int j = chosen.getSecond().intValue()
						+ currentSlamMap.getOriginY();
				Point2D pos = currentSlamMap.getPositionFromBin(i, j);
				chosenGoal = new NavigationGoalData("FrontierBasedExploration",
						pos.getX(LengthUnit.METER), pos.getY(LengthUnit.METER),
						0, PositionData.ReferenceFrame.GLOBAL, LengthUnit.METER, AngleUnit.RADIAN);
			}
		}

		// if goal is next to current position, turn!
		if (chosenGoal.getDistance(currentPosition, LengthUnit.METER) <= options.goalDistanceToTurnInPlace) {
			chosenGoal.setYaw(currentPosition.getYaw(AngleUnit.RADIAN)
					+ Math.PI / 2, AngleUnit.RADIAN);
			chosenGoal.setYawTolerance(YAW_TOLERANCE, AngleUnit.RADIAN);
		} else {
			chosenGoal.setYawTolerance(2 * Math.PI, AngleUnit.RADIAN);
			chosenGoal.setFrameId(PositionData.ReferenceFrame.GLOBAL);
		}
		return chosenGoal;
	}

	private NavigationGoalData chooseOrientation(NavigationGoalData goal) {

		// get slam data
		DynamicGridMap slam = null;
		DynamicGridMap dataMap = null;
		synchronized (slamLock) {
			slam = currentSlamMap;
			dataMap = currentDataMap;
		}
		if (slam == null) {
			logger.warn("slam map is null");
			return goal;
		}
		if (dataMap == null) {
			dataMap = slam;
		}

		int x = slam.getBinXFromPosition(goal);
		int y = slam.getBinYFromPosition(goal);

		Vector<Integer> segments = new Vector<>();
		for (int i = 0; i < ORIENTATION_SEGMENTS; i++) {
			segments.add(new Integer(0));
		}
		double piFrag = ORIENTATION_SEGMENTS / 2.0;

		// one meter
		int d = (int) Math.round(1.0 / dataMap.getResolution(LengthUnit.METER));
		logger.info("orientation check radius: " + d);

		// fill segments vector with sums of middle values
		for (int i = x - d; i <= x + d; i++) {
			for (int j = y - d; j <= y + d; j++) {

				if (i < 0 || i >= dataMap.getWidth() || j < 0
						|| j >= dataMap.getHeight()) {
					logger.warn("cell " + i + "," + j + " is off the map");
					continue;
				}
				double angle = Math.atan2(j - y, i - x);
				double value = dataMap.getValue(i, j);
				if (Math.abs(value - SLAM_MIDDLE_VALUE) < SLAM_VALUE_TOLERANCE) {
					// decide which segment
					for (int k = 1; k <= ORIENTATION_SEGMENTS; k++) {
						if (angle < -Math.PI + (double) k * Math.PI / piFrag) {
							segments.set(k - 1,
									segments.get(k - 1).intValue() + 1);
							break;
						}
					}
				}
			}
		}

		// get index with most middle values
		Integer maxElement = Collections.max(segments);
		int maxIndex = segments.indexOf(maxElement);

		double angle = -Math.PI + (double) maxIndex * Math.PI / piFrag
				+ Math.PI / (2.0 * piFrag);

		logger.info(maxElement.intValue() + " cells voting for angle " + angle
				+ " (" + maxIndex + ")");

		goal.setYaw(angle, AngleUnit.RADIAN);

		return goal;
	}

	private void calculateMeanDistance() {
		Collections.sort(distancesForMean);
		meanDistance = 0;
		int count = 0;
		for (int i = 0; i < distancesForMean.size()
				&& i < options.numFrontiersForMeanDistance; i++) {
			meanDistance += distancesForMean.get(i);
			count++;
		}
		if (count != 0) {
			meanDistance /= (double) count;
		}
	}

	/**
	 * Getter for the mean distance of all frontiers to the robot's current
	 * position. This is a measure for the amount that is explored in the
	 * current area.
	 * 
	 * @param unit
	 *            The {@link LengthUnit} of the returned value.
	 * 
	 * @return mean distance of the frontiers to the robot's position.
	 */
	public double getMeanDistance(LengthUnit unit) {
		return UnitConverter.convert(meanDistance, LengthUnit.METER, unit);
	}

	private void updateFrontiers() {

		logger.debug("update called");

		// get slam data
		DynamicGridMap slam = null;
		DynamicGridMap dataMap = null;
		synchronized (slamLock) {
			slam = currentSlamMap;
			dataMap = currentDataMap;
		}
		if (slam == null) {
			logger.warn("slam map is null");
			return;
		}
		if (dataMap == null) {
			dataMap = slam;
		}

		boolean widthEqual = true;
		boolean heightEqual = true;
		if (oldDataMap != null) {
			widthEqual = oldDataMap.getWidth() == dataMap.getWidth();
			heightEqual = oldDataMap.getHeight() == dataMap.getHeight();
		}

		logger.debug("checking map");

		// search on map
		for (int i = 0; i < dataMap.getWidth(); i++) {
			for (int j = 0; j < dataMap.getHeight(); j++) {

				// check if something altered to previous update
				if (oldDataMap != null && widthEqual && heightEqual) {
					if (dataMap.getValue(i, j) == oldDataMap.getValue(i, j)) {
						continue;
					}
				}

				// calculate id relative to coordinate origin
				int i0 = i - dataMap.getOriginX();
				int j0 = j - dataMap.getOriginY();

				// remove old frontier
				frontiers.removeIf(f -> f.getFirst().intValue() == i0
						&& f.getSecond().intValue() == j0);

				// check if another frontier is near by
				if (isNearExistingFrontier(dataMap, i, j)) {
					continue;
				}

				if (isFrontier(slam, dataMap, i, j)) {
					frontiers.add(new Pair<>(i0, j0));
				}

			}
		}
		if (frontiers.isEmpty()) {
			logger.warn("No frontiers found!");
		}

		oldDataMap = dataMap;
	}

	private boolean isNearExistingFrontier(DynamicGridMap slamMap, int i, int j) {

		// check only already analysed area
		for (Pair<Integer> frontier : frontiers) {

			// check only already analysed area
			int fi = frontier.getFirst().intValue();
			int fj = frontier.getSecond().intValue();

			// calculate id relative to coordinate origin
			int i0 = i - slamMap.getOriginX();
			int j0 = j - slamMap.getOriginY();

			boolean checkedArea = fi < i0 || (fi == i0 && fj < j0);

			if (checkedArea) {

				// check distance distance
				int distance = (int) Math.sqrt(Math.pow(fi - i0, 2)
						+ Math.pow(fj - j0, 2));

				if (distance <= options.minBinsDistanceToOtherFrontier) {
					return true;
				}
			}
		}
		return false;
	}

	private boolean isFrontier(DynamicGridMap slamMap, DynamicGridMap dataMap,
			int i, int j) {

		// check if position is known to be clear
		if (dataMap.getValue(i, j) == SLAM_MIDDLE_VALUE
				|| slamMap.getValue(i, j) <= SLAM_MIDDLE_VALUE) {
			return false;
		}

		// check neighborhood
		boolean foundUnknown = false;
		boolean foundObstacle = false;
		DynamicGridMap d = dataMap;
		switch (options.neighborhood) {
		case EIGHT_CELL:

			if (isUnknown(d, i - 1, j - 1) || isUnknown(d, i + 1, j - 1)
					|| isUnknown(d, i - 1, j + 1) || isUnknown(d, i + 1, j + 1)) {
				foundUnknown = true;
			}
			if (isUnknown(d, i, j - 1) || isUnknown(d, i, j + 1)
					|| isUnknown(d, i - 1, j) || isUnknown(d, i + 1, j)) {
				foundUnknown = true;
			}
			break;

		case FOUR_CELL:

			if (isUnknown(d, i, j - 1) || isUnknown(d, i, j + 1)
					|| isUnknown(d, i - 1, j) || isUnknown(d, i + 1, j)) {
				foundUnknown = true;
			}

			break;

		default:
			break;
		}

		int bins = options.minBinsDistanceToObstacle;
		for (int x = i - bins; x < i + bins; x++) {
			for (int y = j - bins; y < j + bins; y++) {

				if (isObstacle(slamMap, x, y)) {
					foundObstacle = true;
				}
			}
		}

		// if an obstacle is in the neighborhood, this is not really an
		// interesting frontier.
		if (foundObstacle) {
			return false;
		}

		// if the known area borders an unknown area, this is an interesting
		// frontier.
		if (foundUnknown) {
			return true;
		}

		// otherwise this is not a frontier
		return false;
	}

	private boolean isUnknown(DynamicGridMap slamMap, int i, int j) {
		return checkOccupancy(slamMap, i, j) == Occupancy.UNKNOWN;
	}

	private boolean isObstacle(DynamicGridMap slamMap, int i, int j) {
		return checkOccupancy(slamMap, i, j) == Occupancy.OBSTACLE;
	}

	private Occupancy checkOccupancy(DynamicGridMap slamMap, int i, int j) {

		if (i < 0 || j < 0 || i >= slamMap.getWidth()
				|| j >= slamMap.getHeight()) {
			return Occupancy.OBSTACLE;
		}

		float value = slamMap.getValue(i, j);

		double tolerance = options.toleranceForSlamMiddleValue;
		if (value < SLAM_MIDDLE_VALUE - tolerance) {
			return Occupancy.OBSTACLE;
		} else if (value < SLAM_MIDDLE_VALUE + tolerance) {
			return Occupancy.UNKNOWN;
		} else {
			return Occupancy.CLEAR;
		}
	}

	private void debug(List<Pair<Integer>> frontiers, PositionData chosen,
			PositionData currentPosition) {
		if (debugMode) {

			String windowTitle = "Frontier based exploration Debugging";
			if (debugFrame0 == null) {
				debugFrame0 = new JFrame(windowTitle);
				debugFrame0.setDefaultCloseOperation(JFrame.DISPOSE_ON_CLOSE);
				BorderLayout layout0 = new BorderLayout();
				debugFrame0.getContentPane().setLayout(layout0);
				debugPanel0 = new MapPanel();
				debugFrame0.getContentPane().add(debugPanel0,
						BorderLayout.CENTER);
				debugFrame0.setVisible(true);
				debugFrame0.setSize(DEBUG_WIDTH, DEBUG_HEIGHT);
				debugFrame1 = new JFrame(windowTitle);
				debugFrame1.setDefaultCloseOperation(JFrame.DISPOSE_ON_CLOSE);
				BorderLayout layout1 = new BorderLayout();
				debugFrame1.getContentPane().setLayout(layout1);
				debugPanel1 = new MapPanel();
				debugFrame1.getContentPane().add(debugPanel1,
						BorderLayout.CENTER);
				debugFrame1.setVisible(true);
				debugFrame1.setSize(DEBUG_WIDTH, DEBUG_HEIGHT);
			}

			synchronized (slamLock) {
				debugPanel0.updateMap(currentSlamMap);
				debugPanel0.updateFrontiers(frontiers);
				debugPanel0.updateChosen(chosen);
				debugPanel0.updatePosition(currentPosition);
				debugPanel0.repaint();
				debugPanel1.updateMap(currentDataMap);
				debugPanel1.updateFrontiers(frontiers);
				debugPanel1.updateChosen(chosen);
				debugPanel1.updatePosition(currentPosition);
				debugPanel1.repaint();
			}
		}
	}

	/**
	 * For debugging.
	 * 
	 * @author lziegler
	 */
	private class MapPanel extends JPanel {

		private static final int ADDITIONAL = 3;
		private static final long serialVersionUID = 1L;
		private DynamicGridMap map;
		private List<Pair<Integer>> frontiers;
		private PositionData chosen;
		private PositionData position;
		private static final int RADIUS = 5;

		public void updateMap(DynamicGridMap map) {
			this.map = map;
		}

		public void updateFrontiers(List<Pair<Integer>> frontiers) {
			this.frontiers = frontiers;
		}

		public void updateChosen(PositionData chosen) {
			this.chosen = chosen;
		}

		public void updatePosition(PositionData position) {
			this.position = position;
		}

		@Override
		public void paint(Graphics g) {

			if (map == null) {
				return;
			}
			Graphics2D g2 = (Graphics2D) g;
			g2.setRenderingHint(RenderingHints.KEY_ANTIALIASING,
					RenderingHints.VALUE_ANTIALIAS_ON);
			BufferedImage img = SlamTools.gridMapToImage(map);
			int width = getWidth();
			int height = getHeight();
			double slamWidth = (double) map.getWidth();
			double slamHeight = (double) map.getHeight();
			AffineTransform imageTransform = new AffineTransform(width
					/ slamWidth, 0, 0, height / slamHeight, 0, 0);
			AffineTransform pointTransform = new AffineTransform(imageTransform);
			pointTransform.scale(1, -1);
			pointTransform.translate(0, -(map.getHeight() - 1));

			// Draw transformed image
			g2.drawImage(img, imageTransform, this);

			// Draw slam origin
			g2.setColor(Color.GREEN);
			int ox = map.getOriginX();
			int oy = map.getOriginY();
			double[] origin = new double[] { ox, oy };
			pointTransform.transform(origin, 0, origin, 0, 1);
			ox = (int) origin[0];
			oy = (int) origin[1];
			g2.drawLine(ox - RADIUS, oy, ox + RADIUS, oy);
			g2.drawLine(ox, oy - RADIUS, ox, oy + RADIUS);

			// current position
			g2.setColor(Color.BLUE);
			double[] pos = new double[] {
					map.x2idx(position.getX(LengthUnit.METER), LengthUnit.METER),
					map.y2idx(position.getY(LengthUnit.METER), LengthUnit.METER) };
			pointTransform.transform(pos, 0, pos, 0, 1);
			int x = (int) pos[0];
			int y = (int) pos[1];
			double yaw = position.getYaw(AngleUnit.RADIAN);
			g2.drawOval(x - RADIUS, y - RADIUS, (RADIUS * 2) + 1,
					(RADIUS * 2) + 1);
			float lineLength = RADIUS + ADDITIONAL;
			g2.drawLine(x, y, x + (int) (cos(yaw) * lineLength), y
					- (int) (sin(yaw) * lineLength));

			// frontiers
			g2.setColor(Color.RED);
			for (Pair<Integer> f : frontiers) {
				int i = f.getFirst().intValue() + map.getOriginX();
				int j = f.getSecond().intValue() + map.getOriginY();
				pos = new double[] { i, j };
				pointTransform.transform(pos, 0, pos, 0, 1);
				x = (int) pos[0];
				y = (int) pos[1];
				g2.drawOval(x - ADDITIONAL, y - ADDITIONAL,
						(ADDITIONAL * 2) + 1, (ADDITIONAL * 2) + 1);
			}

			// chosen
			g2.setColor(Color.BLUE);
			pos = new double[] {
					map.x2idx(chosen.getX(LengthUnit.METER), LengthUnit.METER),
					map.y2idx(chosen.getY(LengthUnit.METER), LengthUnit.METER) };
			pointTransform.transform(pos, 0, pos, 0, 1);
			x = (int) pos[0];
			y = (int) pos[1];
			g2.fillOval(x - ADDITIONAL, y - ADDITIONAL, (ADDITIONAL * 2) + 1,
					(ADDITIONAL * 2) + 1);
		}
	}

	/**
	 * Container for all relevant options for the frontier based exploration
	 * strategy.
	 * 
	 * @author lziegler
	 */
	public static class Options {

		/**
		 * Defines the used cell neighborhood definition.
		 */
		public enum Neighborhood {
			/**
			 * Eight-cell neighborhood.
			 */
			EIGHT_CELL,
			/**
			 * Four-cell neighborhood.
			 */
			FOUR_CELL
		}

		/**
		 * Defines variants of the frontier algorithm.
		 */
		public enum Variant {
			/**
			 * Algorithm picks a random frontier as next goal.
			 */
			RANDOM,
			/**
			 * Algorithm picks the frontier that is reachable with the shortest
			 * path as next goal.
			 */
			SHORTEST_PATH,
			/**
			 * Algorithm picks the nearest frontier as next goal.
			 */
			NEAREST
		}

		/**
		 * Number of grid map bins for each navigation graph node.
		 */
		public static final int DEFAULT_BINS_PER_NODE = 7;

		/**
		 * Number of nearest frontier points to calculate the mean distance
		 * value from.
		 */
		public static final int DEFAULT_MEAN_DIST_NUM = 8;

		/**
		 * Number of grid map bins that must be between an obstacle and a
		 * frontier point.
		 */
		public static final int DEFAULT_MIN_OBSTACLE_DISTANCE_BINS = 6;

		/**
		 * Number of grid map bins that must be between two frontier points.
		 */
		public static final int DEFAULT_MIN_FRONTIER_DISTANCE_BINS = 4;

		/**
		 * The tolerance when determing a slam middle value.
		 */
		public static final double DEFAULT_SLAM_MIDDLE_TOLERANCE = 0.0001;

		/**
		 * The distance from the current position from where the next navigation
		 * goal is just a rotation.
		 */
		public static final double DEFAULT_TURN_DISTANCE = 1.0;

		/**
		 * The default variant.
		 */
		public static final Variant DEFAULT_VARIANT = Variant.SHORTEST_PATH;

		/**
		 * The default neighborhood definition.
		 */
		public static final Neighborhood DEFAULT_NEIGHBORHOOD = Neighborhood.FOUR_CELL;

		// CHECKSTYLE:OFF
		public int binsPerNodeInPathPlanning = DEFAULT_BINS_PER_NODE;
		public int numFrontiersForMeanDistance = DEFAULT_MEAN_DIST_NUM;
		public int minBinsDistanceToObstacle = DEFAULT_MIN_OBSTACLE_DISTANCE_BINS;
		public int minBinsDistanceToOtherFrontier = DEFAULT_MIN_FRONTIER_DISTANCE_BINS;
		public double toleranceForSlamMiddleValue = DEFAULT_SLAM_MIDDLE_TOLERANCE;
		public double goalDistanceToTurnInPlace = DEFAULT_TURN_DISTANCE;
		public Variant variant = DEFAULT_VARIANT;
		public Neighborhood neighborhood = DEFAULT_NEIGHBORHOOD;
	}
}
