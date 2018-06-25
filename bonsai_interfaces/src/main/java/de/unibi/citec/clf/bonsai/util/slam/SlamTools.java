package de.unibi.citec.clf.bonsai.util.slam;



import de.unibi.citec.clf.btl.data.map.BinarySlamMap;
import de.unibi.citec.clf.btl.data.map.DynamicGridMap;
import edu.uci.ics.jung.algorithms.shortestpath.DijkstraDistance;
import edu.uci.ics.jung.graph.Graph;
import edu.uci.ics.jung.graph.UndirectedSparseMultigraph;
import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.geom.Rectangle2D;
import java.awt.image.BufferedImage;
import java.util.Map;
import org.apache.commons.collections15.Transformer;
import org.apache.log4j.Logger;

/**
 * Some utility methods for working with SLAM data.
 * 
 * @author dklotz
 */
public class SlamTools {

    private static final float SLAM_MIDDLE_VALUE = 0.5f;
    private static final float SLAM_TOLERANCE = 0.001f;
    private static final double WEIGHT_STRAIGHT = 1.0;
    private static final double WEIGHT_DIAGONAL = Math.sqrt(2.0);

    /** For logging output. */
    private static final Logger LOGGER = Logger.getLogger(SlamTools.class);

    /**
     * Converts the slam map contained in the {@link BinarySlamMapData} to a
     * displayable image.
     * 
     * @param slamMap
     *            The SLAM data container, must not be null.
     * @return An image of the occupancy grid in its original size (1 grid cell
     *         = 1 pixel), never null.
     */
    public static BufferedImage slamMapToImage(BinarySlamMap slamMap) {

        return gridMapToImage(slamMap.getDynamicGridMap());
    }

    public static BufferedImage gridMapToImage(DynamicGridMap map) {
        // Graphics setup, gray level image etc.
        BufferedImage image = new BufferedImage(map.getWidth(), map.getHeight(), BufferedImage.TYPE_BYTE_GRAY);
        Graphics2D g2d = image.createGraphics();

        // Create one pixel for each point in the occupancy grid
        for (int x = 0; x < map.getWidth(); x++) {
            for (int y = 0; y < map.getHeight(); y++) {
                // Create a grey value from the occupancy value (0 = black =
                // occupied, 1 = white = unoccupied).
                float mapValue = map.getGridMap()[x][y];
                g2d.setColor(new Color(mapValue, mapValue, mapValue));

                // Create a 1 pixel rectangle and draw it (mirroring the y
                // coordinate, because of the occupancy grids layout, described
                // at the top).
                Rectangle2D pixelRect = new Rectangle2D.Double(x, (map.getHeight() - 1) - y, 1, 1);
                g2d.draw(pixelRect);
            }
        }

        return image;
    }

    /**
     * A simple node for the navigation graph.
     * 
     * @author lziegler
     */
    public static class Node {

        private static int nodeCount = 0;
        private int id;
        private int anchorX;
        private int anchorY;
        private boolean clear;

        public Node(int anchorX, int anchorY, boolean clear) {
            this.id = nodeCount++;
            this.anchorX = anchorX;
            this.anchorY = anchorY;
            this.clear = clear;
        }

        public boolean isclear() {
            return clear;
        }

        public int getId() {
            return id;
        }

        public int getAnchorX() {
            return anchorX;
        }

        public int getAnchorY() {
            return anchorY;
        }

        public String toString() {
            return "V" + id;
        }
    }

    /**
     * A simple edge for the navigation graph.
     * 
     * @author lziegler
     */
    public static class Edge {

        private double weight;
        private static int edgeCount = 0;
        private int id;

        public Edge(double weight) {
            this.id = edgeCount++;
            this.weight = weight;
        }

        public double getWeight() {
            return weight;
        }

        public int getId() {
            return id;
        }

        public String toString() {
            return "E" + id;
        }
    }

    /**
     * Calculates the nearest node to one map bin.
     * 
     * @param g
     *            The graph.
     * @param x
     *            The map bin's x coordinate.
     * @param y
     *            The map bin's y coordinate.
     * @return The corresponding node.
     */
    public static Node getNearestNode(Graph<Node, Edge> g, int x, int y) {

        double minDist = Double.MAX_VALUE;
        Node nearest = null;
        for (Node node : g.getVertices()) {
            double dx = x - node.getAnchorX();
            double dy = y - node.getAnchorY();
            double dist = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
            if (dist < minDist) {
                minDist = dist;
                nearest = node;
            }
        }
        return nearest;
    }

    /**
     * Calculates the shortest path distance to a target bin.
     * 
     * @param g
     *            The graph.
     * @param distanceMap
     *            The distance map.
     * @param targetX
     *            The target map bin's x coordinate.
     * @param targetY
     *            The target map bin's y coordinate.
     * @return the shortest path distance to the given bin.
     */
    public static double getDistance(Graph<Node, Edge> g, Map<Node, Number> distanceMap, int targetX, int targetY) {

        // TODO this can be implemented much faster!!!
        Node target = getNearestNode(g, targetX, targetY);
        if (distanceMap.containsKey(target)) {
            return distanceMap.get(target).doubleValue();
        } else {
            // not reachable
            return Double.MAX_VALUE;
        }
    }

    /**
     * Generates a map containing the shortest path distances to each node
     * relative to one reference bin.
     * 
     * @param g
     *            The graph.
     * @param sourceX
     *            The reference bin's x coordinate.
     * @param sourceY
     *            The reference bin's y coordinate.
     * @return The distance map.
     */
    public static Map<Node, Number> getDistanceMap(Graph<Node, Edge> g, int sourceX, int sourceY) {

        Transformer<Edge, Double> transformer = Edge::getWeight;

        DijkstraDistance<Node, Edge> distanceAlgo = new DijkstraDistance<>(g, transformer);

        Node source = getNearestNode(g, sourceX, sourceY);

        return distanceAlgo.getDistanceMap(source);
    }

    /**
     * Generates a graph corresponding to the given slam map, that can be used
     * for different graph algorithms.
     * 
     * @param slamMap
     *            The slam map.
     * @param numBinsPerNode
     *            The number of slam grid map bins, that should belong to one
     *            node on one axis. That means one node will correspond to
     *            numBinsPerNode^2 map bins.
     * @return The graph.
     */
    public static Graph<Node, Edge> generateNavigationGraph(DynamicGridMap slamMap, int numBinsPerNode) {

        UndirectedSparseMultigraph<Node, Edge> g = new UndirectedSparseMultigraph<>();
        int halfSize = numBinsPerNode / 2;
        Node[][] nodeMap = new Node[slamMap.getWidth()][slamMap.getHeight()];

        // traverse map
        for (int x = 0; x <= slamMap.getWidth() - numBinsPerNode; x += numBinsPerNode) {
            for (int y = 0; y <= slamMap.getHeight() - numBinsPerNode; y += numBinsPerNode) {

                // check if area is clear
                boolean clear = isAreaClear(slamMap, x, y, numBinsPerNode);

                // add node
                Node n = new Node(x + halfSize / 2, y + halfSize / 2, clear);
                g.addVertex(n);
                nodeMap[x][y] = n;

                // edge to left node
                if (x - numBinsPerNode >= 0) {
                    Node otherNode = nodeMap[x - numBinsPerNode][y];
                    if (n.isclear() && otherNode.isclear()) {
                        g.addEdge(new Edge(WEIGHT_STRAIGHT), n, otherNode);
                    }
                }

                // edge to upper node
                if (y - numBinsPerNode >= 0) {
                    Node otherNode = nodeMap[x][y - numBinsPerNode];
                    if (n.isclear() && otherNode.isclear()) {
                        g.addEdge(new Edge(WEIGHT_STRAIGHT), n, otherNode);
                    }
                }

                // edge to upper left node
                if (y - numBinsPerNode >= 0 && x - numBinsPerNode >= 0) {
                    Node otherNode = nodeMap[x - numBinsPerNode][y - numBinsPerNode];
                    if (n.isclear() && otherNode.isclear()) {
                        g.addEdge(new Edge(WEIGHT_DIAGONAL), n, otherNode);
                    }
                }

                // edge to beneath left node
                if (y + numBinsPerNode < slamMap.getHeight() && x - numBinsPerNode >= 0) {
                    Node otherNode = nodeMap[x - numBinsPerNode][y + numBinsPerNode];
                    if (n.isclear() && otherNode.isclear()) {
                        g.addEdge(new Edge(WEIGHT_DIAGONAL), n, otherNode);
                    }
                }
            }
        }

        return g;
    }

    private static boolean isAreaClear(DynamicGridMap slamMap, int topLeftX, int topLeftY, int areaSize) {

        boolean foundObstacle = false;
        boolean foundUnknown = false;
        boolean foundClear = false;
        for (int x = topLeftX; x < topLeftX + areaSize; x++) {
            if (x >= slamMap.getWidth()) {
                break;
            }
            for (int y = topLeftY; y < topLeftY + areaSize; y++) {
                if (y >= slamMap.getHeight()) {
                    break;
                }
                if (slamMap.getValue(x, y) < SLAM_MIDDLE_VALUE - SLAM_TOLERANCE) {
                    foundObstacle = true;
                } else if (slamMap.getValue(x, y) < SLAM_MIDDLE_VALUE + SLAM_TOLERANCE) {
                    foundUnknown = true;
                } else {
                    foundClear = true;
                }
            }
        }
        return (foundClear && !foundObstacle);
    }

    private SlamTools() {
        // Just to prevent instantiation.
    }
}
