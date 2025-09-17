package de.unibi.citec.clf.btl.data.geometry;

import de.unibi.citec.clf.btl.units.LengthUnit;
import org.junit.Test;

import static org.junit.Assert.*;

public class Point2DStampedTest {

    @Test
    public void equals() {

        Point2DStamped instance = new Point2DStamped();
        instance.setX(1, LengthUnit.METER);
        instance.setY(2, LengthUnit.METER);
        instance.setFrameId("map");

        Point2DStamped instance2 = new Point2DStamped(1, 2, LengthUnit.METER, "map");

        Point2DStamped instance3 = new Point2DStamped(1,2);
        instance3.setFrameId("base");

        assertTrue(instance.equals(instance2));
        assertFalse(instance.equals(instance3));

        assertTrue(instance2.getOriginalLU().equals(LengthUnit.METER));
    }

    @Test
    public void copy() {

        Point2DStamped instance = new Point2DStamped(1, 2, LengthUnit.METER, "map");
        Point2DStamped instance2 = new Point2DStamped(instance);

        boolean result = instance.equals(instance2);
        assertTrue(result);
    }

    @Test
    public void distance() {
        Point2DStamped instance = new Point2DStamped(1000, 1000,LengthUnit.MILLIMETER);
        Point2DStamped instance2 = new Point2DStamped(1, 2);
        assertEquals(1000,instance.distance(instance2),0.0);
        assertEquals(1,instance.getDistance(instance2,LengthUnit.METER),0.0);

        instance.setFrameId("base");

        assertEquals(1000,instance.distance(instance2),0.0);
    }

    @Test
    public void add() {
        Point2DStamped instance = new Point2DStamped(1, 1);
        Point2DStamped instance2 = new Point2DStamped(1, 2);

        Point2DStamped sum = new Point2DStamped(2,3);
        assertEquals(sum,instance.add(instance2));
    }

    @Test
    public void mul() {
        Point2DStamped instance = new Point2DStamped(1, 1);
        Point2DStamped instance2 = new Point2DStamped(1, 2);

        Point2DStamped mul = new Point2DStamped(1,2);
        assertEquals(mul,instance.mul(instance2));
    }

    @Test
    public void sub() {
        Point2DStamped instance = new Point2DStamped(1, 1);
        Point2DStamped instance2 = new Point2DStamped(1, 2);

        Point2DStamped sub = new Point2DStamped(0,-1);
        assertEquals(sub, instance.sub(instance2));
    }

    @Test
    public void div() {
        Point2DStamped instance = new Point2DStamped(1, 1);
        Point2DStamped instance2 = new Point2DStamped(1, 2);

        Point2DStamped div = new Point2DStamped(1,0.5);
        assertEquals(div,instance.div(instance2));
    }

    @Test
    public void getLength() {
        Point2DStamped instance = new Point2DStamped(2, 0);

        assertEquals(2,instance.getLength(LengthUnit.METER),0.0);
    }

    @Test
    public void dotProduct() {
        Point2DStamped instance = new Point2DStamped(1, 1);
        Point2DStamped instance2 = new Point2DStamped(1, 2);

        assertEquals(3,instance.dotProduct(instance2), 0.0);
    }

    @Test
    public void getAngle() {
        Point2DStamped instance = new Point2DStamped(1, 1);
        Point2DStamped instance2 = new Point2DStamped(10, 1);

        assertEquals(0, instance.getAngle(instance2),0.0);
    }
}