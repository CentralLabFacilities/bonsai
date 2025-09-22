package de.unibi.citec.clf.btl.data.map;



import de.unibi.citec.clf.btl.Type;
import de.unibi.citec.clf.btl.data.geometry.PrecisePolygon;
import de.unibi.citec.clf.btl.data.geometry.Pose2D;
import de.unibi.citec.clf.btl.units.LengthUnit;

import java.util.Arrays;
import java.util.LinkedList;
import java.util.UUID;

/**
 * This type describes an annotation of a map, e.g., rooms or no-go areas. Each
 * annotation is represented by an area (polygon) and has several viewpoints of
 * different categories.
 *
 * <code>
 * <ANNOTATION label="kitchen">
 *      <TIMESTAMP>
 *          <INSERTED value="1334754163505" />
 *          <UPDATED value="1334754163505" />
 *      </TIMESTAMP>
 *      <GENERATOR>unknown</GENERATOR>
 *      <VIEWPOINT label="table1" category="VIEW">
 *          <ROBOTPOSITION>
 *              <TIMESTAMP>
 *                  <INSERTED value="1334589211533" />
 *                  <UPDATED value="1334589211533" />
 *              </TIMESTAMP>
 *              <GENERATOR>unknown</GENERATOR>
 *              <POSITION x="0.0" y="1.0" theta="2.0" ref="world" kind="absolute" />
 *              </ROBOTPOSITION>
 *      </VIEWPOINT>
 *      <VIEWPOINT label="table2" category="VIEW">
 *          <ROBOTPOSITION>
 *              <TIMESTAMP>
 *                  <INSERTED value="1334589211533" />
 *                  <UPDATED value="1334589211533" />
 *              </TIMESTAMP>
 *              <GENERATOR>unknown</GENERATOR>
 *              <POSITION x="0.0" y="1.0" theta="2.0" ref="world" kind="absolute" />
 *          </ROBOTPOSITION>
 *      </VIEWPOINT>
 *      <PRECISEPOLYGON>
 *          <POINT2D x="0.0" y="0.0" scope="GLOBAL" />
 *          <POINT2D x="0.0" y="2000.0" scope="GLOBAL" />
 *          <POINT2D x="2000.0" y="2000.0" scope="GLOBAL" />
 *          <POINT2D x="2000.0" y="0.0" scope="GLOBAL" />
 *      </PRECISEPOLYGON>
 * </ANNOTATION>
 * </code>
 *
 * @author lkettenb
 */
@Deprecated
public class Annotation extends Type {

    /**
     * Name/label of this annotation. This label should be unique. Please note
     * that this is not verified until now.
     */
    protected String label = UUID.randomUUID().toString();
    /**
     * This polygon describes the area of this annotation.
     */
    protected PrecisePolygon polygon = new PrecisePolygon();
    /**
     * List of all viewpoints that belong to this annotation. Every viewpoint
     * should have a unique label. Please note that this is not verified until
     * now.
     */
    protected LinkedList<Viewpoint> viewpoints =
            new LinkedList<>();

    /**
     * Default constructor as expected by {@link Type}. You should not use it!
     */
    public Annotation() {
    }

    /**
     * Constructor.
     *
     * @param label Name of this annotation.
     * @param polygon Polygon that describes the area of this annotation.
     * @param viewpoints One or more initial viewpoints that belong to this
     * annotation.
     */
    public Annotation(String label, PrecisePolygon polygon,
            Viewpoint... viewpoints) {
        this.label = label;
        this.polygon = polygon;
        this.viewpoints.addAll(Arrays.asList(viewpoints));
    }

    /**
     * Constructor.
     *
     * @param label Name of this annotation.
     * @param polygon Polygon that describes the area of this annotation.
     * @param viewpoints One or more initial viewpoints that belong to this
     * annotation.
     */
    public Annotation(String label, PrecisePolygon polygon,
            LinkedList<Viewpoint> viewpoints) {
        this.label = label;
        this.polygon = polygon;
        this.viewpoints = viewpoints;
    }

    /**
     * Use this method to access the polygon of this annotation. You may use it
     * to determine whether a point is inside this polygon.
     *
     * @see PrecisePolygon#contains(double, double)
     *
     * @return Polygon of this annotation.
     */
    public PrecisePolygon getPolygon() {
        return polygon;
    }

    /**
     * Returns a list of all viewpoints. Please note that a viewpoint is not
     * necessarily inside of the annotation its polygon/area.
     *
     * @return List of all viewpoints.
     */
    public LinkedList<Viewpoint> getViewpoints() {
        return viewpoints;
    }

    /**
     * Returns nearest viewpoint to given position
     *
     * @param position given position
     * @return nearest viewpoint
     */
    public Viewpoint getNearestViewPoint(Pose2D position) {
        double minDist = Double.MAX_VALUE;
        Viewpoint result = null;
        for (Viewpoint vp : viewpoints) {
            double distance = Math.sqrt(Math.pow(vp.getX(LengthUnit.METER)
                    - position.getX(LengthUnit.METER), 2)
                    + Math.pow(
                    vp.getY(LengthUnit.METER)
                    - position.getY(LengthUnit.METER), 2));
            if (distance < minDist) {
                minDist = distance;
                result = vp;
            }
        }
        return result;
    }

    public Viewpoint getViewpointByName(String name){
        for (Viewpoint vp : viewpoints) {
            if(vp.getLabel().equals(name)){
                return vp;
            }
        }
        return null;
    }
    
    /**
     * Will return the main viewpoint (the one with the label 'main').
     * @return the requested viewpoint
     */
    public Viewpoint getMain(){
        for(Viewpoint vp : viewpoints){
            if(vp.label.equals("main")){
                return vp;
            }
        }
        return null;
    }

    /**
     * Label/name of this annotation.
     *
     * @return Label/name of this annotation.
     */
    public String getLabel() {
        return label;
    }

    public void setPolygon(PrecisePolygon polygon) {
        this.polygon = polygon;
    }

    public void setViewpoints(LinkedList<Viewpoint> viewpoints) {
        this.viewpoints = viewpoints;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    @Override
    public boolean equals(Object obj) {
        try {
            if (!(obj instanceof Annotation)) {
                return false;
            }

            Annotation other = (Annotation) obj;

            if (!other.getLabel().equals(getLabel())) {
                return false;
            }
            if (!other.getPolygon().equals(getPolygon())) {
                return false;
            }
            if (!other.getViewpoints().equals(getViewpoints())) {
                return false;
            }

        } catch (Exception e) {
            return false;
        }
        return true;
    }

    @Override
    public int hashCode() {
        int hash = 5;
        hash = 97 * hash + (this.label != null ? this.label.hashCode() : 0);
        hash = 97 * hash + (this.polygon != null ? this.polygon.hashCode() : 0);
        hash = 97 * hash + (this.viewpoints != null ? this.viewpoints.hashCode() : 0);
        return hash;
    }
}
