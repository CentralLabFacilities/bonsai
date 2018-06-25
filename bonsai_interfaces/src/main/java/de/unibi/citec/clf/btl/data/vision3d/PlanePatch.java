package de.unibi.citec.clf.btl.data.vision3d;



import de.unibi.citec.clf.btl.data.geometry.PolygonalPatch3D;
import de.unibi.citec.clf.btl.data.geometry.Pose3D;
import de.unibi.citec.clf.btl.data.geometry.PrecisePolygon;

/**
 * @author lziegler
 *
 */
public class PlanePatch extends PolygonalPatch3D {

    String surfaceName;

    /**
     * Create patch.
     */
    public PlanePatch() {
        super();
    }

    /**
     * Copy constructor.
     *
     * @param other Other instance to copy
     */
    public PlanePatch(PolygonalPatch3D other) {
        super(other);
    }

    /**
     * Copy constructor.
     *
     * @param other Other instance to copy
     */
    public PlanePatch(PlanePatch other) {
        super(other);
    }

    /**
     * Construct instance from base and border.
     *
     * @param base The base for construction of this patch
     * @param border The border of the patch
     */
    public PlanePatch(Pose3D base, PrecisePolygon border) {
        super(base, border);
    }

    public String getSurfaceName() {
        return surfaceName;
    }

    public void setSurfaceName(String surfaceName) {
        this.surfaceName = surfaceName;
    }

}
