package de.unibi.citec.clf.btl.data.geometry;

import de.unibi.citec.clf.btl.units.LengthUnit;
import org.junit.Test;
import static org.junit.Assert.*;

/**
 *
 * @author lruegeme
 */
public class Point3DTest {

    @Test
    public void equals() {
        
        Point3D instance = new Point3D(1, 2, 3, LengthUnit.METER);
        Point3D instance2 = new Point3D(1, 2, 3, LengthUnit.METER);
        
        boolean result = instance.equals(instance2);
        assertTrue(result);
    }

    @Test
    public void copy() {
        
        Point3D instance = new Point3D(1, 2, 3, LengthUnit.METER);
        Point3D instance2 = new Point3D(instance);
        
        boolean result = instance.equals(instance2);
        assertTrue(result);
    }
    
}
