package de.unibi.citec.clf.btl.data.geometry;

import de.unibi.citec.clf.btl.units.LengthUnit;
import javafx.geometry.Point2DBuilder;
import org.junit.Test;

import static org.junit.Assert.*;

public class Point2DTest {

    @Test
    public void equals() {

        Point2D instance = new Point2D();
        instance.setX(1, LengthUnit.METER);
        instance.setY(2, LengthUnit.METER);
        instance.setFrameId("map");

        Point2D instance2 = new Point2D(1, 2, LengthUnit.METER, "map");

        Point2D instance3 = new Point2D(1,2);
        instance3.setFrameId("base");

        assertTrue(instance.equals(instance2));
        assertFalse(instance.equals(instance3));

        assertTrue(instance2.getOriginalLU().equals(LengthUnit.METER));
    }

    @Test
    public void copy() {

        Point2D instance = new Point2D(1, 2, LengthUnit.METER, "map");
        Point2D instance2 = new Point2D(instance);

        boolean result = instance.equals(instance2);
        assertTrue(result);
    }

    @Test
    public void distance() {
        Point2D instance = new Point2D(1000, 1000,LengthUnit.MILLIMETER);
        Point2D instance2 = new Point2D(1, 2);
        assertEquals(1000,instance.distance(instance2),0.0);
        assertEquals(1,instance.getDistance(instance2,LengthUnit.METER),0.0);

        instance.setFrameId("base");

        assertEquals(1000,instance.distance(instance2),0.0);
    }

    @Test
    public void add() {
        Point2D instance = new Point2D(1, 1);
        Point2D instance2 = new Point2D(1, 2);

        Point2D sum = new Point2D(2,3);
        assertEquals(sum,instance.add(instance2));
    }

    @Test
    public void mul() {
        Point2D instance = new Point2D(1, 1);
        Point2D instance2 = new Point2D(1, 2);

        Point2D mul = new Point2D(1,2);
        assertEquals(mul,instance.mul(instance2));
    }

    @Test
    public void sub() {
        Point2D instance = new Point2D(1, 1);
        Point2D instance2 = new Point2D(1, 2);

        Point2D sub = new Point2D(0,-1);
        assertEquals(sub, instance.sub(instance2));
    }

    @Test
    public void div() {
        Point2D instance = new Point2D(1, 1);
        Point2D instance2 = new Point2D(1, 2);

        Point2D div = new Point2D(1,0.5);
        assertEquals(div,instance.div(instance2));
    }

    @Test
    public void getLength() {
        Point2D instance = new Point2D(2, 0);

        assertEquals(2,instance.getLength(LengthUnit.METER),0.0);
    }

    @Test
    public void dotProduct() {
        Point2D instance = new Point2D(1, 1);
        Point2D instance2 = new Point2D(1, 2);

        assertEquals(3,instance.dotProduct(instance2), 0.0);
    }

    @Test
    public void getAngle() {
        Point2D instance = new Point2D(1, 1);
        Point2D instance2 = new Point2D(10, 1);

        assertEquals(0, instance.getAngle(instance2),0.0);
    }
}