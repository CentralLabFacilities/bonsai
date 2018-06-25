package de.unibi.citec.clf.bonsai.util.helper;


import de.unibi.citec.clf.bonsai.core.exception.CommunicationException;
import de.unibi.citec.clf.bonsai.core.object.MemorySlot;
import de.unibi.citec.clf.bonsai.core.object.Sensor;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.common.Timestamp;
import de.unibi.citec.clf.btl.data.geometry.Point2D;
import de.unibi.citec.clf.btl.data.geometry.PrecisePolygon;
import de.unibi.citec.clf.btl.data.map.Annotation;
import de.unibi.citec.clf.btl.data.map.AnnotationList;
import de.unibi.citec.clf.btl.data.map.Viewpoint;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;

import java.io.IOException;
import java.util.HashMap;
import java.util.LinkedList;
import java.util.Map;
import java.util.Set;

import org.apache.log4j.Logger;

/**
 * Use this manager to read and write annotations and viewpoints more easily.
 * <p>
 * Needs a MemorySlot of type {@link List} with Type {@link Annotation}.
 *
 * @author lkettenb
 */
public class AnnotationHelper {

    /**
     * The Logger.
     */
    private Logger logger = Logger.getLogger(this.getClass());
    /**
     * Sensor to access the memory and searching for annotations.
     */
    @Deprecated
    private Sensor<List<Annotation>> annotationListSensor = null;
    /**
     * Slot to access the memory and searching for annotations.
     */
    private MemorySlot<AnnotationList> annotationListSlot = null;
    /**
     * Current instance of annotations.
     */
    private List<Annotation> annotations =
            new List<Annotation>(Annotation.class);
    private static Map<String, String> objsCategory = null;
    private static Map<String, Double> categoryInfo = null;
    private static Map<String, String> mapCategoryToLocation = null;

    /**
     * Create a instance of this class and read latest annotations from memory.
     *
     * @param annotationListSensor Sensor to access the memory and searching for
     *                             annotations.
     * @deprecated From now on we use {@link MemorySlot}s.
     */
    @Deprecated
    public AnnotationHelper(Sensor<List<Annotation>> annotationListSensor) {
        this.annotationListSensor = annotationListSensor;
        readAnnotations();
    }

    /**
     * Create a instance of this class and read latest annotations from memory.
     *
     * @param annotationListSlot Slot to access the memory and searching for
     *                           annotations.
     */
    public AnnotationHelper(MemorySlot<AnnotationList> annotationListSlot) {
        this.annotationListSlot = annotationListSlot;
        readAnnotations();
    }

    /**
     * This method searches for the first annotation with the given label and
     * returns its centroid as {@link PositionData} with yaw=0.
     *
     * @param label Label or name of the annotation.
     * @return Position of the label its centroid or null.
     * @see PrecisePolygon#getCentroid()
     */
    public PositionData getAnnotationCentroid(String label) {
        Annotation annotation = getAnnotation(label);
        if (annotation == null) {
            return null;
        }
        Point2D point = annotation.getPolygon().getCentroid();
        if (point == null) {
            return null;
        }
        PositionData posData = new PositionData(
                point.getX(LengthUnit.METER),
                point.getY(LengthUnit.METER),
                0,
                new Timestamp(),
                LengthUnit.METER,
                AngleUnit.RADIAN);
        return posData;
    }

    /**
     * Tries to read the latest annotations from memory.
     */
    private void readAnnotations() {
        List<Annotation> tmpAnnotations = null;
        if (annotationListSlot != null) {
            try {
                tmpAnnotations = annotationListSlot.recall();
            } catch (CommunicationException ex) {
                logger.fatal("Unable to recall annotations: " + ex.getMessage());
            }
            if (tmpAnnotations != null) {
                annotations = tmpAnnotations;
            }
        } else if (annotationListSensor != null) {
            if (annotationListSensor != null && annotationListSensor.hasNext()) {
                try {
                    tmpAnnotations = annotationListSensor.readLast(3000);
                } catch (IOException ex) {
                    logger.warn("IOException while trying to read "
                            + "latest annotations." + ex.getMessage());
                } catch (InterruptedException ex) {
                    logger.warn("InterruptedException while trying "
                            + "to read latest annotations." + ex.getMessage());
                }
                if (tmpAnnotations != null) {
                    annotations = tmpAnnotations;
                }
            }
        }
    }

    /**
     * Returns the latest list of annotations.
     *
     * @return The latest list of annotations.
     */
    public List<Annotation> getAnnotations() {
        readAnnotations();
        return annotations;
    }

    /**
     * Searches for the first annotation with given label and returns it.
     *
     * @param label Label or name of the annotation.
     * @return Found annotation or null.
     */
    public Annotation getAnnotation(String label) {
        // Get latest annotations.
        readAnnotations();
        for (Annotation annotation : annotations) {
            if (label.equals(annotation.getLabel())) {
                return annotation;
            }
        }
        return null;
    }

    /**
     * This method searches for the first annotation that contains the given
     * position. Use this method, e.g., to figure out the robot's current
     * annotation/room.
     *
     * @param positionData Any valid position.
     * @return Found annotation or null.
     */
    public Annotation getAnnotation(PositionData positionData) {
        // Get latest annotations.
        readAnnotations();
        Point2D point = new Point2D(
                positionData.getX(LengthUnit.METER),
                positionData.getY(LengthUnit.METER),
                LengthUnit.METER);
        for (Annotation annotation : annotations) {
            if (annotation.getPolygon().contains(point)) {
                return annotation;
            }
        }
        return null;
    }

    /**
     * Searches for the first viewpoint with given label and returns it.
     *
     * @param label Label or name of the viewpoint.
     * @return Found viewpoint or null.
     */
    public Viewpoint getViewpoint(String label) {
        // Get latest annotations.
        readAnnotations();
        for (Annotation annotation : annotations) {
            for (Viewpoint viewpoint : annotation.getViewpoints()) {
                if (label.equals(viewpoint.getLabel())) {
                    return viewpoint;
                }
            }
        }
        return null;
    }

    /**
     * Returns a list with all viewpoints that match the given category.
     *
     * @param annotation Annotation to be searched.
     * @return List with all viewpoints that match the given category.
     */
    public List<Viewpoint> getViewpoints(Annotation annotation) {
        // Get latest annotations.
        readAnnotations();
        List<Viewpoint> viewpoints = new List<Viewpoint>(Viewpoint.class);

        for (Viewpoint viewpoint : annotation.getViewpoints()) {
            viewpoints.add(viewpoint);
        }

        return viewpoints;
    }

    /**
     * Searches for the first annotation with label labelAnnotation that has a
     * viewpoint with label labelViewpoint and returns it.
     *
     * @param labelViewpoint  Label or name of the viewpoint.
     * @param labelAnnotation Label or name of the annotation.
     * @return Found viewpoint or null.
     */
    public Viewpoint getViewpoint(String labelViewpoint,
                                  String labelAnnotation) {
        // Get latest annotations.
        readAnnotations();
        for (Annotation annotation : annotations) {
            if (labelAnnotation.equals(annotation.getLabel())) {
                for (Viewpoint viewpoint : annotation.getViewpoints()) {
                    if (labelViewpoint.equals(viewpoint.getLabel())) {
                        return viewpoint;
                    }
                }
            }
        }
        return null;
    }

    /**
     * Searches for the first annotation with label labelAnnotation that has a
     * viewpoint with label labelViewpoint and returns weather it was found.
     *
     * @param labelViewpoint  Label or name of the viewpoint.
     * @param labelAnnotation Label or name of the annotation.
     * @return true is found, otherwise false.
     */
    public boolean hasViewpoint(String labelViewpoint,
                                String labelAnnotation) {
        // Get latest annotations.
        readAnnotations();
        return getViewpoint(labelViewpoint, labelAnnotation) != null;
    }

    /**
     * Calculates the closest viewpoint to the given {@link PositionData}.
     *
     * @param positionData Any position, e.g. current position of the robot.
     * @param viewpoints   List of viewpoints to compare the position data with.
     * @return Viewpoint closest to given position.
     */
    public static Viewpoint closestViewpoint(PositionData positionData,
                                             List<Viewpoint> viewpoints) {
        Viewpoint closestViewpoint = null;
        double minDist = Double.MAX_VALUE;
        for (int i = 0; i < viewpoints.size(); i++) {
            Viewpoint viewpoint = viewpoints.get(i);
            PositionData coordinates = viewpoint;
            double dist = positionData.getDistance(coordinates, LengthUnit.METER);
            if (dist <= minDist) {
                minDist = dist;
                closestViewpoint = viewpoint;
            }
        }
        return closestViewpoint;
    }

    /**
     * Returns the first viewpoint with the given label or null.
     *
     * @param label      Label to be searched for in the list.
     * @param viewpoints List of viewpoints.
     * @return Viewpoint with the given label or null.
     */
    public static Viewpoint getViewpointByLabel(String label,
                                                List<Viewpoint> viewpoints) {
        for (Viewpoint vp : viewpoints) {
            Logger.getLogger(AnnotationHelper.class).debug("getViewpointByLabel() check vp: " + vp.getLabel());
            if (label.equals(vp.getLabel())) {
                return vp;
            }
        }
        return null;
    }

    /**
     * Returns the first viewpoint with the given label or null.
     *
     * @param label      Label to be searched for in the list.
     * @param viewpoints LinkedList of viewpoints.
     * @return Viewpoint with the given label or null.
     */
    public static Viewpoint getViewpointByLabel(String label,
                                                LinkedList<Viewpoint> viewpoints) {
        for (Viewpoint vp : viewpoints) {
            if (label.equals(vp.getLabel())) {
                return vp;
            }
        }
        return null;
    }

    /**
     * Returns a list of Annotations in which the Viewpoint occurred. Lists all
     * in case that are more Viewpoints with the same name.
     *
     * @param label      Label to be searched for in the list.
     * @return List of all Annotations with a Viewpoint of the given label.
     */
    public LinkedList<String> getAllAnnotationsForViewpoint(String label) {
        // Get latest annotations.
        readAnnotations();

        LinkedList<String> listOfAnnotations = new LinkedList<>();

        for (Annotation annotation : annotations) {
            for (Viewpoint viewpoint : annotation.getViewpoints()) {
                if (label.equals(viewpoint.getLabel())) {
                    listOfAnnotations.add(annotation.getLabel());
                }
            }
        }

        return listOfAnnotations;
    }

    /**
     * Checks is Object is known in our Database.
     *
     * @param objName ObjectName
     * @return True/False
     */
    public static boolean objCategoryContains(String objName) {

        if (objsCategory == null) {
            fillObjInfos();
        }
        return objsCategory.containsKey(objName);
    }

    /**
     * Returns the specific Category for the inserted Object.
     *
     * @param objName ObjectName
     * @return Category
     */
    public static String getobjCategory(String objName) {
        if (objsCategory == null) {
            fillObjInfos();
        }
        return objsCategory.get(objName);
    }

    private static void fillObjInfos() {
        objsCategory = new HashMap<String, String>();
        //food

        objsCategory.put("deodorant", "cleaning_stuff");
        objsCategory.put("tooth_paste", "cleaning_stuff");
        objsCategory.put("cleaner", "cleaning_stuff");
        objsCategory.put("fresh_discs", "cleaning_stuff");
        objsCategory.put("sponge", "cleaning_stuff");

        objsCategory.put("beer_bottle", "drinks");
        objsCategory.put("fanta", "drinks");
        objsCategory.put("beer_can", "drinks");
        objsCategory.put("coke", "drinks");
        objsCategory.put("seven_up", "drinks");
        objsCategory.put("chocolate_milk", "drinks");
        objsCategory.put("energy_drink", "drinks");
        objsCategory.put("orange_juice", "drinks");
        objsCategory.put("milk", "drinks");
        objsCategory.put("apple_juice", "drinks");

        objsCategory.put("tomato_sauce", "food");
        objsCategory.put("peanut_butter", "food");
        objsCategory.put("chicken_noodles", "food");
        objsCategory.put("marmalade", "food");
        objsCategory.put("veggie_noodles", "food");
        objsCategory.put("garlic_sauce", "food");

        objsCategory.put("chocolate", "snacks");
        objsCategory.put("cookies", "snacks");
        objsCategory.put("drops", "snacks");
        objsCategory.put("crackers", "snacks");


//        objsCategory.put("cookies", "food");
//        objsCategory.put("milk", "food");
//        objsCategory.put("pringles_red", "food");
        //GermanOpen 2013 stuff
        /*//drinks
        objsCategory.put("redbull", "drink");
        objsCategory.put("coke", "drink");
        objsCategory.put("juice", "drink");
        objsCategory.put("beer", "drink");
        objsCategory.put("water", "drink");
        objsCategory.put("wine", "drink");
        
        
        //medicine
        objsCategory.put("bandaids", "medicine");
        objsCategory.put("creme", "medicine");
        objsCategory.put("kleenex", "medicine");
       
        //stuff
        objsCategory.put("matches", "stuff");
        objsCategory.put("cards", "stuff");
        objsCategory.put("flowers", "stuff");
        objsCategory.put("soap", "stuff");
        objsCategory.put("sponge", "stuff");
        objsCategory.put("bag", "stuff");
        objsCategory.put("headphone", "stuff");
        objsCategory.put("cube", "stuff");
        objsCategory.put("tape", "stuff");
        objsCategory.put("cup", "stuff");
        objsCategory.put("microphone", "stuff");
        
        //food
        objsCategory.put("cookies", "food");
        objsCategory.put("peanuts", "food");
        objsCategory.put("chocolate", "food");
        objsCategory.put("hazelnuts", "food");
        objsCategory.put("noodles", "food");*/

        objsCategory.put("unknown", "trash");
    }

    /**
     * Checks if Category exists.
     *
     * @param catName CategoryName
     * @return True/False
     */
    public static boolean categoryListContains(String catName) {

        if (categoryInfo == null) {
            fillCategoryInfos();
        }
        return categoryInfo.containsKey(catName);
    }

    /**
     * Returns the specific Category Height for the inserted Category.
     *
     * @param catName CategoryName
     * @return TableHeight
     */
    public static double getCategoryHeight(String catName) {
        if (categoryInfo == null) {
            fillCategoryInfos();
        }
        return categoryInfo.get(catName);
    }

    /**
     * Lists all categories.
     *
     * @return Set of Category Strings
     */
    public static Set<String> getCategoryNames() {
        if (mapCategoryToLocation == null) {
            fillCategoryToLocation();
        }
        return mapCategoryToLocation.keySet();
    }

    private static void fillCategoryInfos() {
        categoryInfo = new HashMap<String, Double>();

        categoryInfo.put("trash_bin", 380.0);
        categoryInfo.put("side_table", 450.0);
        categoryInfo.put("bar", 79.0);
        categoryInfo.put("stove", 94.0);
        categoryInfo.put("hallwaytable", 450.0);


        //for magdeburg german open 2013
        //TODO: AKTUALISIEREN
//        categoryInfo.put("wastebin", 400.0);
//        categoryInfo.put("side_board", 380.0);
        //GermanOpen 2013 stuff
       /* categoryInfo.put("couchtable", 460.0); // MILLIMETERS height of the place
        categoryInfo.put("bed", 480.0);
        categoryInfo.put("desk", 740.0);
        categoryInfo.put("wastebin", 400.0);
        categoryInfo.put("sidetable", 460.0);*/

    }

    /**
     * Checks if Category Location exists.
     *
     * @param catName CategoryName
     * @return True/False
     */
    public static boolean categoryLocationContains(String catName) {

        if (mapCategoryToLocation == null) {
            fillCategoryToLocation();
        }
        return mapCategoryToLocation.containsKey(catName);
    }

    /**
     * Returns the specific Location for the inserted Category.
     *
     * @param catName CategoryName
     * @return Location
     */
    public static String getCategoryLocation(String catName) {
        if (mapCategoryToLocation == null) {
            fillCategoryToLocation();
        }
        return mapCategoryToLocation.get(catName);
    }

    private static void fillCategoryToLocation() {
        mapCategoryToLocation = new HashMap<String, String>();

        mapCategoryToLocation.put("drinks", "bar");
        mapCategoryToLocation.put("cleaning_stuff", "hallway_table");
        mapCategoryToLocation.put("food", "stove");
        mapCategoryToLocation.put("snacks", "side_table");
        mapCategoryToLocation.put("unknown", "trash_bin");

//        mapCategoryToLocation.put("food", "side_board");
//        mapCategoryToLocation.put("trash", "wastebin");

        //for magdeburg german open 2013
        /*mapCategoryToLocation.put("drink", "couchtable");
        mapCategoryToLocation.put("medicine", "bed");
        mapCategoryToLocation.put("stuff", "desk");
        mapCategoryToLocation.put("food", "sidetable");
        mapCategoryToLocation.put("trash", "wastebin")*/
    }
}
