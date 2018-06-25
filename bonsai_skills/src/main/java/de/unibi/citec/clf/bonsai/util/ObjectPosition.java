package de.unibi.citec.clf.bonsai.util;



import de.unibi.citec.clf.btl.data.geometry.Point3D;
import de.unibi.citec.clf.btl.data.navigation.PositionData;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.LengthUnit;


public class ObjectPosition extends PositionData {

	String classLabel = "";

	double positionImageX;
	double positionImageY;
	double positionImageWidht;
	double positionImageHeight;
	double reliability;
	Point3D position3D;

	public ObjectPosition(PositionData p) {
		super(p.getX(LengthUnit.CENTIMETER), p.getY(LengthUnit.CENTIMETER), p.getYaw(AngleUnit.RADIAN), p.getTimestamp(),LengthUnit.CENTIMETER,AngleUnit.RADIAN);
	}

	public ObjectPosition(PositionData p, String classLabel) {
		super(p.getX(LengthUnit.CENTIMETER), p.getY(LengthUnit.CENTIMETER), p.getYaw(AngleUnit.RADIAN), p.getTimestamp(),LengthUnit.CENTIMETER,AngleUnit.RADIAN);
		this.classLabel = classLabel;
	}

	public ObjectPosition(PositionData p, String classLabel,
			double positionImageX, double positionImageY,
			double positionImageWidht, double positionImageHeight, double reliability) {
		super(p.getX(LengthUnit.CENTIMETER), p.getY(LengthUnit.CENTIMETER), p.getYaw(AngleUnit.RADIAN), p.getTimestamp(),LengthUnit.CENTIMETER,AngleUnit.RADIAN);
		this.classLabel = classLabel;
		this.positionImageX = positionImageX;
		this.positionImageY = positionImageY;
		this.positionImageWidht = positionImageWidht;
		this.positionImageHeight = positionImageHeight;
		this.reliability = reliability;
	}

	public String getClassLabel() {
		return classLabel;
	}

	public void setClassLabel(String classLabel) {
		this.classLabel = classLabel;
	}

	public double getPositionImageX() {
		return positionImageX;
	}

	public void setPositionImageX(double positionImageX) {
		this.positionImageX = positionImageX;
	}

	public double getPositionImageY() {
		return positionImageY;
	}

	public void setPositionImageY(double positionImageY) {
		this.positionImageY = positionImageY;
	}

	public double getPositionImageWidht() {
		return positionImageWidht;
	}

	public void setPositionImageWidht(double positionImageWidht) {
		this.positionImageWidht = positionImageWidht;
	}

	public double getPositionImageHeight() {
		return positionImageHeight;
	}

	public void setPositionImageHeight(double positionImageHeight) {
		this.positionImageHeight = positionImageHeight;
	}

	public double getReliability() {
		return reliability;
	}

	public void setReliability(double reliability) {
		this.reliability = reliability;
	}

	public Point3D getPosition3D() {
		return position3D;
	}

	public void setPosition3D(Point3D point) {
		this.position3D = point;
	}
	
	
}
