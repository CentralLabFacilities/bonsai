package de.unibi.citec.clf.bonsai.util.helper;


import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.object.ObjectShapeData;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.util.Collections;
import java.util.Comparator;
import org.apache.log4j.Logger;

/**
 * A class responsible for the various management activities related to objects.
 *
 * @author lruegeme
 */
public final class ObjectHelper {

    /**
     * The log.
     */
    private static final Logger logger = Logger.getLogger(ObjectHelper.class);

    public static void sortByXPos(java.util.List<ObjectShapeData> list) {
        Collections.sort(list, new Comparator<ObjectShapeData>() {

            @Override
            public int compare(ObjectShapeData a, ObjectShapeData b) {
                Point3D aC = a.getCenter();
                Point3D bC = b.getCenter();

                return aC.getX(LengthUnit.MILLIMETER) < bC.getX(LengthUnit.MILLIMETER) ? -1 : aC.getX(LengthUnit.MILLIMETER) == bC.getX(LengthUnit.MILLIMETER) ? 0 : 1;
            }
        });
    }

    static double getSizeFromObject(ObjectShapeData obj) {
        return obj.getWidth(LengthUnit.CENTIMETER) * obj.getHeight(LengthUnit.CENTIMETER);
    }

    public static void sortByZPos(java.util.List<ObjectShapeData> list) {
        Collections.sort(list, new Comparator<ObjectShapeData>() {

            @Override
            public int compare(ObjectShapeData a, ObjectShapeData b) {
                Point3D aC = a.getCenter();
                Point3D bC = b.getCenter();

                return aC.getZ(LengthUnit.MILLIMETER) < bC.getZ(LengthUnit.MILLIMETER) ? -1 : aC.getZ(LengthUnit.MILLIMETER) == bC.getZ(LengthUnit.MILLIMETER) ? 0 : 1;
            }
        });
    }

    public static void sortBySize(java.util.List<ObjectShapeData> list) {
        Collections.sort(list, new Comparator<ObjectShapeData>() {

            @Override
            public int compare(ObjectShapeData a, ObjectShapeData b) {
                double aS = getSizeFromObject(a);
                double bS = getSizeFromObject(b);

                return aS < bS ? -1 : aS == bS ? 0 : 1;
            }
        });
    }

    public static void sortByBestRel(java.util.List<ObjectShapeData> list) {
        Collections.sort(list, new Comparator<ObjectShapeData>() {

            @Override
            public int compare(ObjectShapeData o1, ObjectShapeData o2) {
                double a = o1.getBestRel();
                double b = o2.getBestRel();
                return (int) Math.round((b - a) * 1000);
            }

        });
    }

    public static void sortByDistance(java.util.List<ObjectShapeData> list) {
        Collections.sort(list, new Comparator<ObjectShapeData>() {

            @Override
            public int compare(ObjectShapeData o1, ObjectShapeData o2) {
                Point3D center = new Point3D(0, 0, 0, LengthUnit.METER);
                double a = o1.getBoundingBox().getPose().getTranslation().distance(center);
                double b = o2.getBoundingBox().getPose().getTranslation().distance(center);
                return a < b ? -1 : a == b ? 0 : 1;
            }

        });
    }

}
