package de.unibi.citec.clf.btl.data.knowledgebase;

import de.unibi.citec.clf.btl.data.geometry.Point2D;
import de.unibi.citec.clf.btl.data.map.Annotation;
import de.unibi.citec.clf.btl.units.LengthUnit;

/**
 * @author rfeldhans
 *
 * A class to capsulate some methods of Rooms, Locations and Doors, which are tied to the annotation of those classes.
 */
public abstract class AreaDescriber extends BDO {

    protected Annotation annotation;

    public Annotation getAnnotation() {
        return annotation;
    }
    public void setAnnotation(Annotation annotation) {
        this.annotation = annotation;
    }


    /**
     * Returns whether a specific Point is at this door..
     *
     * @param p the Point
     * @return
     */
    public boolean isIn(Point2D p) {
        return annotation.getPolygon().contains(p);
    }

    /**
     * Returns whether a specific Point is at this door.
     *
     * @param x the Points X-Coordinate
     * @param y the Points Y-Coordinate
     * @param unit the length unit of this coordinates
     * @return
     */
    public boolean isIn(double x, double y, LengthUnit unit) {
        Point2D p = new Point2D();
        p.setX(x, unit);
        p.setY(y, unit);
        return annotation.getPolygon().contains(p);
    }


}
