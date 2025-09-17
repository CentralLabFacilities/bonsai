package de.unibi.citec.clf.btl.data.geometry;


import java.awt.geom.AffineTransform;
import java.awt.geom.GeneralPath;
import java.awt.geom.PathIterator;
import java.util.Comparator;
import java.util.Iterator;


import de.unibi.citec.clf.btl.Type;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;
import de.unibi.citec.clf.btl.units.UnitConverter;

/**
 * This is a serializable and iterable polygon type. It is similar to
 * nothing, but has a double precision.
 *
 * @author lziegler
 */
public class PrecisePolygon extends Type implements Iterable<Point2D> {

    private final LengthUnit meter = LengthUnit.METER;

    private List<Point2D> list = new List<>(Point2D.class);

    public PrecisePolygon(PrecisePolygon poly) {
        LengthUnit unit = LengthUnit.MILLIMETER;
        for (Point2D point : poly) {
            list.add(new Point2D(point.getX(unit), point.getY(unit), unit));
        }
    }

    public PrecisePolygon() {
    }

    public int getPointCount() {
        return list.size();
    }

    public void addPoint(double x, double y, LengthUnit unit) {
        list.add(new Point2D(x, y, unit));
    }

    /**
     * Adds a {@link Point2D} to the polygon.
     *
     * @param point The {@link Point2D} instance to add.
     */
    public void addPoint(Point2D point) {
        list.add(point);
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public String toString() {
        String info = "[PRECISEPOLYGON";
        for (Point2D p : list) {
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
            if (!(obj instanceof PrecisePolygon)) {
                return false;
            }

            PrecisePolygon other = (PrecisePolygon) obj;

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
    public Point2D getCentroid() {

        double x = 0;
        double y = 0;
        int count = 0;
        for (Point2D p : list) {
            x += p.getX(LengthUnit.MILLIMETER);
            y += p.getY(LengthUnit.MILLIMETER);
            count++;
        }

        if (count == 0) {
            return null;
        } else {
            return new Point2D(x / (double) count, y / (double) count,
                    LengthUnit.MILLIMETER);
        }
    }

    public double getMinX(LengthUnit unit) {
        double minX = Double.POSITIVE_INFINITY;
        for (Point2D point : list) {
            double x = point.getX(unit);
            if (minX > x) {
                minX = x;
            }
        }
        return minX;
    }

    public double getMaxX(LengthUnit unit) {
        double maxX = Double.NEGATIVE_INFINITY;
        for (Point2D point : list) {
            double x = point.getX(unit);
            if (maxX < x) {
                maxX = x;
            }
        }
        return maxX;
    }

    public double getMinY(LengthUnit unit) {
        double minY = Double.POSITIVE_INFINITY;
        for (Point2D point : list) {
            double y = point.getY(unit);
            if (minY > y) {
                minY = y;
            }
        }
        return minY;
    }

    public double getMaxY(LengthUnit unit) {
        double maxY = Double.NEGATIVE_INFINITY;
        for (Point2D point : list) {
            double y = point.getY(unit);
            if (maxY < y) {
                maxY = y;
            }
        }
        return maxY;
    }

    public void move(double dx, double dy, LengthUnit unit) {
        for (Point2D point : list) {
            point.setX(point.getX(unit) + dx, unit);
            point.setY(point.getY(unit) + dy, unit);
        }
    }

    public void scale(double factor) {
        for (Point2D point : list) {
            point.setX(point.getX(LengthUnit.MILLIMETER) * factor,
                    LengthUnit.MILLIMETER);
            point.setY(point.getY(LengthUnit.MILLIMETER) * factor,
                    LengthUnit.MILLIMETER);
        }
    }

    /**
     * Rotates this polygon around a given center coordinate by a given angle.
     *
     * @param center The center of the rotation.
     * @param angle  The angle to rotate.
     * @param unit   The unit of the given angle value.
     */
    public void rotate(Point2D center, double angle, AngleUnit unit) {

        // ensure radiant unit
        angle = UnitConverter.convert(angle, unit, AngleUnit.RADIAN);

        // generate path
        GeneralPath path = generatePath(LengthUnit.MILLIMETER);

        // create an affine transformation representing the rotation
        AffineTransform trans = AffineTransform.getRotateInstance(angle,
                center.getX(LengthUnit.MILLIMETER),
                center.getY(LengthUnit.MILLIMETER));

        // apply transform
        path.transform(trans);

        // update path
        updateFromPath(path, LengthUnit.MILLIMETER);
    }

    /**
     * Rotates this polygon around a given center coordinate by a given angle.
     *
     * @param x          The center of the rotation.
     * @param y          The center of the rotation.
     * @param lengthUnit Unit of the given center values.
     * @param angle      The angle to rotate.
     * @param angleUnit  The unit of the given angle value.
     */
    public void rotate(double x, double y, LengthUnit lengthUnit, double angle,
                       AngleUnit angleUnit) {

        // ensure radiant unit
        angle = UnitConverter.convert(angle, angleUnit, AngleUnit.RADIAN);

        // generate path
        GeneralPath path = generatePath(lengthUnit);

        // create an affine transformation representing the rotation
        AffineTransform trans = AffineTransform.getRotateInstance(angle, x, y);

        // apply transform
        path.transform(trans);

        // update path
        updateFromPath(path, lengthUnit);
    }

    /**
     * Tests if the given coordinate lies inside this polygon.
     *
     * @param x    X-coordinate of the point to check.
     * @param y    Y-coordinate of the point to check.
     * @param unit The unit of the given values.
     * @return <code>true</code> if the given coordinate lied inside this
     * polygon.
     */
    public boolean contains(double x, double y, LengthUnit unit) {
        if (list.size() < 3) {
            return false;
        }
        return generatePath(unit).contains(x, y);
    }

    /**
     * Tests if the given coordinate lies inside this polygon.
     *
     * @param p Coordinate to check.
     * @return <code>true</code> if the given coordinate lied inside this
     * polygon.
     */
    public boolean contains(Point2D p) {
        return contains(p.getX(meter), p.getY(meter), meter);
    }

    /**
     * Calculates the area of this polygon.
     *
     * @param unit The desired length unit of the resulting value.
     * @return The area of this polygon in the desired unit.
     */
    public double getArea(LengthUnit unit) {

        double minX = getMinX(unit);
        double minY = getMinY(unit);

        // found here: http://www.exaflop.org/docs/cgafaq/cga2.html
        double sum = 0;
        for (int i = 0; i < list.size() - 1; i++) {

            // no negative values
            double x = list.get(i).getX(unit) + minX;
            double xp1 = list.get(i + 1).getX(unit) + minX;
            double y = list.get(i).getY(unit) + minY;
            double yp1 = list.get(i + 1).getY(unit) + minY;

            sum = sum + x * yp1 - y * xp1;
        }
        return Math.abs(sum / 2.0);
    }

    /**
     * Returns the interdiction point of a line, defined by two Points and the
     * Arena.
     *
     * @param insideTheArena  first Point, must be inside the Arena
     * @param outsideTheArena second Point, must be outside the Arena
     * @return The InterdictionPoint between the line and this PrecisePolgon.
     * Null if there is no interdiction or both of the points are in/outside the
     * arena.
     */
    public Point2D getInterdictionPoint(Point2D insideTheArena, Point2D outsideTheArena) {
        Point2D ret = null;

        if (list.size() < 3 || !this.contains(insideTheArena) || this.contains(outsideTheArena)) {
            return null;
        }
        Double x1 = insideTheArena.getX(meter);
        Double y1 = insideTheArena.getY(meter);

        Double x2 = outsideTheArena.getX(meter);
        Double y2 = outsideTheArena.getY(meter);

        for (int i = 0; i < list.size(); i++) {//i is P0
            Point2D p0 = list.get(i);
            Point2D p1 = list.get((i + 1) % list.size());

            Double x3 = p0.getX(meter);
            Double y3 = p0.getY(meter);

            Double x4 = p1.getX(meter);
            Double y4 = p1.getY(meter);

            Double denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
            if (denominator < 0.0001 && denominator > -0.0001) {//lines parallel or almost parallel
                continue;
            }

            Double xi = (x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4);
            xi /= denominator;
            Double yi = (x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4);
            yi /= denominator;

            if (insideTheArena.getX(meter) < xi && xi < outsideTheArena.getX(meter)
                    || outsideTheArena.getX(meter) < xi && xi < insideTheArena.getX(meter)) {
                if (insideTheArena.getY(meter) < yi && yi < outsideTheArena.getY(meter)
                        || outsideTheArena.getY(meter) < yi && yi < insideTheArena.getY(meter)) {
                    //point does lie on line, do nothing. else reject
                } else {
                    continue;
                }
            } else {
                continue;
            }


            if (ret == null) {
                ret = new Point2D(0.0, 0.0, meter);
                ret.setX(xi, meter);
                ret.setY(yi, meter);
            } else {
                Point2D potentialRet = new Point2D(xi, yi, meter);
                if (ret.distance(outsideTheArena) > potentialRet.distance(outsideTheArena)) {
                    ret = potentialRet;
                }
            }

        }

        return ret;
    }


    /**
     * TODO: Implementation
     * @param viewPolygon
     * @return
     */
    public PrecisePolygon getViewOverlap(PrecisePolygon viewPolygon) {
        PrecisePolygon intercept = new PrecisePolygon();
        Point2D robo = viewPolygon.getList().get(0);
        Point2D right = viewPolygon.getList().get(1);
        Point2D left = viewPolygon.getList().get(2);
        intercept.addPoint(robo);

        List<Point2D> intersectionsLeft = getAllIntersections(robo, left);

        while(intersectionsLeft.size() > 1){
            Point2D newRobo = robo;
            intersectionsLeft.sort(new Comparator<Point2D>() {
                @Override
                public int compare(Point2D point2DStamped, Point2D t1) {
                    if(point2DStamped.distance(newRobo) < t1.distance(newRobo)){
                        return -1;
                    }
                    else if(point2DStamped.distance(newRobo) > t1.distance(newRobo)){
                        return 1;
                    }
                    return 0;
                }
            });
            intercept.addPoint(intersectionsLeft.get(0));

            Point2D nextInLine = left;
            for(int i = 0; i < list.size(); i++){
                Point2D p0 = list.get(i);
                Point2D p1 = list.get((i + 1) % list.size());


            }

            left = robo.add(nextInLine.sub(robo).mul(new Point2D(20.0, 20.0, LengthUnit.METER)));
            robo = nextInLine;
            intersectionsLeft = getAllIntersections(robo, left);
        }
        intercept.addPoint(intersectionsLeft.get(0));

        robo = viewPolygon.getList().get(0);
        left = viewPolygon.getList().get(2);
        List<Point2D> intersectionsRight = getAllIntersections(robo, right);
        List<Point2D> stm = new List<>(Point2D.class);
        while(intersectionsRight.size() > 1){
            Point2D newRobo = robo;
            intersectionsRight.sort(new Comparator<Point2D>() {
                @Override
                public int compare(Point2D point2DStamped, Point2D t1) {
                    if(point2DStamped.distance(newRobo) < t1.distance(newRobo)){
                        return -1;
                    }
                    else if(point2DStamped.distance(newRobo) > t1.distance(newRobo)){
                        return 1;
                    }
                    return 0;
                }
            });
            stm.add(intersectionsLeft.get(0));

            PrecisePolygon righthalf = new PrecisePolygon();
            righthalf.addPoint(robo);
            righthalf.addPoint(right.add(left).sub(new Point2D(2.0, 2.0)));
            righthalf.addPoint(right);
            Point2D nextInLine = right;
            for(Point2D each : list){
                if (righthalf.contains(each)){
                    if(robo.distance(each) < robo.distance(nextInLine)){
                        nextInLine = each;
                    }
                }
            }
            right = robo.add(nextInLine.sub(robo).mul(new Point2D(20.0, 20.0, LengthUnit.METER)));
            robo = nextInLine;
            intersectionsRight = getAllIntersections(robo, right);
        }
        for(int i = stm.size()-1; i > -1; i--){
            intercept.addPoint(stm.get(i));
        }

        return intercept;
    }

    /**
     * TODO: Implementation
     * @param viewPolygon
     * @return
     */
    public PrecisePolygon getViewExcept(PrecisePolygon viewPolygon){
        Point2D robo = viewPolygon.getList().get(0);
        Point2D right = viewPolygon.getList().get(1);
        Point2D left = viewPolygon.getList().get(2);

        List<Point2D> intersectionsRight = getAllIntersections(robo, right);
        List<Point2D> intersectionsLeft = getAllIntersections(robo, left);

        Comparator comperator = new Comparator<Point2D>() {
            @Override
            public int compare(Point2D point2D, Point2D t1) {
                if(point2D.distance(robo) < t1.distance(robo)){
                    return -1;
                }
                else if(point2D.distance(robo) > t1.distance(robo)){
                    return 1;
                }
                return 0;
            }
        };
        intersectionsRight.sort(comperator);
        intersectionsLeft.sort(comperator);

        return null;
    }

    /**
     * Checks if two lines, each defined by two points, have an intersection.
     * @return
     */
    private boolean checkIntersect(Point2D p0, Point2D p1, Point2D p2, Point2D p3){
        Double x1 = p2.getX(meter);
        Double y1 = p2.getY(meter);

        Double x2 = p3.getX(meter);
        Double y2 = p3.getY(meter);

        Double x3 = p0.getX(meter);
        Double y3 = p0.getY(meter);

        Double x4 = p1.getX(meter);
        Double y4 = p1.getY(meter);

        Double denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (denominator < 0.0001 && denominator > -0.0001) {//lines parallel or almost parallel
            return false;
        }

        Double xi = (x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4);
        xi /= denominator;
        Double yi = (x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4);
        yi /= denominator;
        if (p2.getX(meter) < xi && xi < p3.getX(meter)
                || p3.getX(meter) < xi && xi < p2.getX(meter)) {
            if (p2.getY(meter) < yi && yi < p3.getY(meter)
                    || p3.getY(meter) < yi && yi < p2.getY(meter)) {
                return true;
            } else {
                return false;
            }
        } else {
            return false;
        }
    }

    /**
     * calculates every intersection this polygon has with a line defined by two point2d's
     *
     * @param inside
     * @param outside
     * @return
     */
    public List<Point2D> getAllIntersections(Point2D inside, Point2D outside) {
        List<Point2D> point2DStampeds = new List<>(Point2D.class);
        if (list.size() < 3 || !this.contains(inside) || this.contains(outside)) {
            return null;
        }
        Double x1 = inside.getX(meter);
        Double y1 = inside.getY(meter);

        Double x2 = outside.getX(meter);
        Double y2 = outside.getY(meter);

        for (int i = 0; i < list.size(); i++) {//i is P0
            Point2D p0 = list.get(i);
            Point2D p1 = list.get((i + 1) % list.size());

            Double x3 = p0.getX(meter);
            Double y3 = p0.getY(meter);

            Double x4 = p1.getX(meter);
            Double y4 = p1.getY(meter);

            Double denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
            if (denominator < 0.0001 && denominator > -0.0001) {//lines parallel or almost parallel
                continue;
            }

            Double xi = (x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4);
            xi /= denominator;
            Double yi = (x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4);
            yi /= denominator;

            if (inside.getX(meter) < xi && xi < outside.getX(meter)
                    || outside.getX(meter) < xi && xi < inside.getX(meter)) {
                if (inside.getY(meter) < yi && yi < outside.getY(meter)
                        || outside.getY(meter) < yi && yi < inside.getY(meter)) {
                    //point does lie on line, do nothing. else reject
                } else {
                    continue;
                }
            } else {
                continue;
            }

            Point2D ret = new Point2D(0.0, 0.0, meter);
            ret.setX(xi, meter);
            ret.setY(yi, meter);
            point2DStampeds.add(ret);

        }
        return point2DStampeds;
    }

    /**
     * Calculates a Point2D which has a certain distance inside this Polygon.
     * The Point will also lie on a line defined by two Point2Ds. Warning: may
     * cause unexpected results when used with a steep entry angle or a high
     * distance relativ to the size of this Polygon. May also take extremly long
     *
     * @param insideTheArena  first Point, must be inside the Arena
     * @param outsideTheArena second Point, must be outside the Arena
     * @param distance        the distance which the calculated Point2D will have from
     *                        the edges of the polygon
     * @param accuracy        the accuracy with which the point shall be calculated.
     *                        Note that higher values require more CPU-time. Suggested value: 0.95 (aka
     *                        95% accuracy)
     * @return The InterdictionPoint between the line and this PrecisePolgon.
     * Null if there is no interdiction or both of the points are in/outside the
     * arena.
     */
    public Point2D getInterdictionPointXDistanceIn(Point2D insideTheArena, Point2D outsideTheArena, Double distance, Double accuracy) {
        Point2D interdict = this.getInterdictionPoint(insideTheArena, outsideTheArena);
        if (interdict == null) {
            return null;
        }
        //no exact solution; will use a iterative algorithm, think perceptron
        Point2D ret = new Point2D(insideTheArena);
        int iteration = 1;
        while (!this.contains(ret) || this.getDistance(ret) < distance * accuracy || this.getDistance(ret) > distance * (2 - accuracy)) {
            Point2D itmul = new Point2D(iteration, iteration, meter);
            Point2D itdiv = new Point2D(iteration + 1, iteration + 1, meter);
            if (this.getDistance(ret) < distance * accuracy) {
                ret = ret.mul(itmul).add(insideTheArena).div(itdiv);
            } else if (this.getDistance(ret) > distance * (2 - accuracy)) {
                ret = ret.mul(itmul).add(interdict).div(itdiv);
            } else {//point basically mirrored at interdictionpoint
                ret = interdict.add(interdict.sub(ret));//mirrors ret at the interdiction point
            }
            if (iteration > 1000) {
                return null;//add determination. yay
            }
            iteration++;
        }
        System.out.println("Iterations needed: " + iteration);
        return ret;
    }

    /**
     * Returns the distance of a point to this polygon. If the point lies inside
     * the polygon, the returned value will be the minimal distance to the edges
     * of the polygon.
     *
     * @param point the point of which the distance to the polygon shall be
     *              calculated.
     * @return <code>-1.0</code> if there were errors, else the distance to the
     * polygon.
     */
    public double getDistance(Point2D point) {
        if (list.size() < 3) {
            return -1.0;
        }
        double minDist = Double.POSITIVE_INFINITY;
        for (int i = 0; i < list.size(); i++) {//i is P1

            //taken from https://en.wikipedia.org/wiki/Distance_from_a_point_to_a_line#Line_defined_by_two_points
            //first, introduce the points
            Point2D p0 = point;
            Point2D p1 = list.get(i);
            Point2D p2 = list.get((i + 1) % list.size());

            //secondly, introduce the values for better overview
            double x0 = p0.getX(point.iLU);
            double y0 = p0.getY(point.iLU);

            double x1 = p1.getX(point.iLU);
            double y1 = p1.getY(point.iLU);

            double x2 = p2.getX(point.iLU);
            double y2 = p2.getY(point.iLU);

            Double dist;
            double denominator = Math.sqrt((y2 - y1) * (y2 - y1) + (x2 - x1) * (x2 - x1));

            if (Math.sqrt((y2 - y0) * (y2 - y0) + (x2 - x0) * (x2 - x0)) > denominator) {
                dist = Math.sqrt((y0 - y1) * (y0 - y1) + (x0 - x1) * (x0 - x1));
            } else if (Math.sqrt((y1 - y0) * (y1 - y0) + (x1 - x0) * (x1 - x0)) > denominator) {
                dist = Math.sqrt((y2 - y0) * (y2 - y0) + (x2 - x0) * (x2 - x0));
            } else {

                double numerator = (y2 - y1) * x0 - (x2 - x1) * y0 + x2 * y1 - y2 * x1;
                if (numerator < 0) {
                    numerator *= -1;
                }

                dist = numerator / denominator;
            }

            if (dist < minDist) {
                minDist = dist;
            }

        }
        return minDist;
    }

    /**
     * Returns the distance of a point to this polygon.
     *
     * @param x    X-coordinate of the point to check.
     * @param y    Y-coordinate of the point to check.
     * @param unit The unit of the given values.
     * @return <code>-1.0</code> if there were errors, else the distance to the
     * polygon.
     */
    public double getDistance(double x, double y, LengthUnit unit) {
        Point2D p = new Point2D(x, y, unit);
        return getDistance(p);
    }

    private GeneralPath generatePath(LengthUnit unit) {
        GeneralPath path = new GeneralPath(GeneralPath.WIND_EVEN_ODD);
        path.reset();
        path.moveTo(list.get(0).getX(unit), list.get(0).getY(unit));
        for (Point2D point : list) {
            path.lineTo(point.getX(unit), point.getY(unit));
        }
        path.closePath();
        return path;
    }

    private void updateFromPath(GeneralPath path, LengthUnit unit) {
        double[] point = new double[6];
        PathIterator iterator = path.getPathIterator(null);
        int count = 0;
        while (!iterator.isDone()) {
            int type = iterator.currentSegment(point);
            if (type == PathIterator.SEG_LINETO) {
                list.get(count).setX(point[0], unit);
                list.get(count).setY(point[1], unit);
                count++;
            }
            iterator.next();
        }
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public Iterator<Point2D> iterator() {
        return list.iterator();
    }

    public int size() {
        return list.size();
    }

    /**
     * List of polygon points.
     */
    public List<Point2D> getList() {
        return list;
    }

    public void setList(List<Point2D> list) {
        this.list = list;
    }
}
