package de.unibi.citec.clf.bonsai.util;



import de.unibi.citec.clf.bonsai.core.exception.TransformException;
import de.unibi.citec.clf.bonsai.core.time.Time;
import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.geometry.Pose3D;
import de.unibi.citec.clf.btl.data.geometry.Rotation3D;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.bonsai.core.object.TransformLookup;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;

import javax.media.j3d.Transform3D;
import javax.vecmath.Matrix3d;
import javax.vecmath.Vector3d;
import javax.vecmath.Vector4d;

public abstract class CoordinateTransformer implements TransformLookup {

	public Point3D transform(Point3D data, String csTo) throws TransformException {
		LengthUnit m = LengthUnit.METER;
		long time = Time.currentTimeMillis() - 300;
		Transform3D t = lookup(data.getFrameId(), csTo, time).getTransform();

		Vector4d vec = new Vector4d(data.getX(m), data.getY(m), data.getZ(m), 1.0);
		t.transform(vec);

		Point3D newData = new Point3D(data);
		newData.setX(vec.x, m);
		newData.setY(vec.y, m);
		newData.setZ(vec.z, m);
		newData.setFrameId(csTo);

		return newData;
	}

	public Rotation3D transform(Rotation3D data, String csTo) throws TransformException {
		long time = Time.currentTimeMillis() - 300;
		Transform3D t = lookup(data.getFrameId(), csTo, time).getTransform();

		Matrix3d transformRot = new Matrix3d();
		t.get(transformRot);

		Matrix3d resultRot = new Matrix3d();
		// From Java3D documentation:
		// mul(): Sets the value of this matrix to the result of multiplying the two argument matrices together.
		resultRot.mul(transformRot, data.getMatrix());

		Rotation3D newRotation = new Rotation3D(resultRot);
		newRotation.setFrameId(csTo);

		return newRotation;
	}

	public Pose3D transform(Pose3D data, String csTo) throws TransformException {

		Point3D t = transform(data.getTranslation(), csTo);
		Rotation3D r = transform(data.getRotation(), csTo);

		Pose3D pose = new Pose3D(data);
		pose.setTranslation(t);
		pose.setRotation(r);
		pose.setFrameId(csTo);
		return pose;
	}

	public Pose3D transform(PositionData data, String csTo) throws TransformException {

		LengthUnit m = LengthUnit.METER;
		double x = data.getX(m);
		double y = data.getY(m);
		double yaw = data.getYaw(AngleUnit.RADIAN);
		String csFrom = data.getFrameId();

		Point3D t = transform(new Point3D(x, y, 0, m, csFrom), csTo);
		Rotation3D r = transform(new Rotation3D(new Vector3d(0, 0, 1), yaw, AngleUnit.RADIAN, csFrom), csTo);

		Pose3D position = new Pose3D(t, r);
		position.setFrameId(csTo);
		position.setGenerator(data.getGenerator());
		position.setMemoryId(data.getMemoryId());
		position.setTimestamp(data.getTimestamp());
		return position;
	}
}
