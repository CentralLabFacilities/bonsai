package de.unibi.citec.clf.btl.data.grasp;



import de.unibi.citec.clf.btl.Type;



public class KatanaGripperData extends Type {

	private double forceRightInsideNear;
	private double forceRightInsideFar;
	private double infraredRightOutside;
	private double infraredRightFront;
	private double infraredRightInsideNear;
	private double infraredRightInsideFar;

	private double forceLeftInsideNear;
	private double forceLeftInsideFar;
	private double infraredLeftOutside;
	private double infraredLeftFront;
	private double infraredLeftInsideNear;
	private double infraredLeftInsideFar;

	private double infraredMiddle;

	/**
	 * Constructor.
	 */
	public KatanaGripperData() {
		super();
	}

	public double getForceRightInsideNear() {
		return forceRightInsideNear;
	}

	public void setForceRightInsideNear(double forceRightInsideNear) {
		this.forceRightInsideNear = forceRightInsideNear;
	}

	public double getForceRightInsideFar() {
		return forceRightInsideFar;
	}

	public void setForceRightInsideFar(double forceRightInsideFar) {
		this.forceRightInsideFar = forceRightInsideFar;
	}

	public double getInfraredRightOutside() {
		return infraredRightOutside;
	}

	public void setInfraredRightOutside(double infraredRightOutside) {
		this.infraredRightOutside = infraredRightOutside;
	}

	public double getInfraredRightFront() {
		return infraredRightFront;
	}

	public void setInfraredRightFront(double infraredRightFront) {
		this.infraredRightFront = infraredRightFront;
	}

	public double getInfraredRightInsideNear() {
		return infraredRightInsideNear;
	}

	public void setInfraredRightInsideNear(double infraredRightInsideNear) {
		this.infraredRightInsideNear = infraredRightInsideNear;
	}

	public double getInfraredRightInsideFar() {
		return infraredRightInsideFar;
	}

	public void setInfraredRightInsideFar(double infraredRightInsideFar) {
		this.infraredRightInsideFar = infraredRightInsideFar;
	}

	public double getForceLeftInsideNear() {
		return forceLeftInsideNear;
	}

	public void setForceLeftInsideNear(double forceLeftInsideNear) {
		this.forceLeftInsideNear = forceLeftInsideNear;
	}

	public double getForceLeftInsideFar() {
		return forceLeftInsideFar;
	}

	public void setForceLeftInsideFar(double forceLeftInsideFar) {
		this.forceLeftInsideFar = forceLeftInsideFar;
	}

	public double getInfraredLeftOutside() {
		return infraredLeftOutside;
	}

	public void setInfraredLeftOutside(double infraredLeftOutside) {
		this.infraredLeftOutside = infraredLeftOutside;
	}

	public double getInfraredLeftFront() {
		return infraredLeftFront;
	}

	public void setInfraredLeftFront(double infraredLeftFront) {
		this.infraredLeftFront = infraredLeftFront;
	}

	public double getInfraredLeftInsideNear() {
		return infraredLeftInsideNear;
	}

	public void setInfraredLeftInsideNear(double infraredLeftInsideNear) {
		this.infraredLeftInsideNear = infraredLeftInsideNear;
	}

	public double getInfraredLeftInsideFar() {
		return infraredLeftInsideFar;
	}

	public void setInfraredLeftInsideFar(double infraredLeftInsideFar) {
		this.infraredLeftInsideFar = infraredLeftInsideFar;
	}

	public double getInfraredMiddle() {
		return infraredMiddle;
	}

	public void setInfraredMiddle(double infraredMiddle) {
		this.infraredMiddle = infraredMiddle;
	}

	/**
	 * {@inheritDoc}
	 */
	@Override
	public String toString() {
		return "KatanaGripperData [" +

		"Force right inside near: " + forceRightInsideNear
				+ "Force right inside far: " + forceRightInsideFar
				+ "Infrared right outside: " + infraredRightOutside
				+ "Infrared right front: " + infraredRightFront
				+ "Infrared right inside near: " + infraredRightInsideNear
				+ "Infrared right inside far: " + infraredRightInsideFar +

				"Force left inside near: " + forceLeftInsideNear
				+ "Force left inside far: " + forceLeftInsideFar
				+ "Infrared left outside: " + infraredLeftOutside
				+ "Infrared left front: " + infraredLeftFront
				+ "Infrared left inside near: " + infraredLeftInsideNear
				+ "Infrared left inside far: " + infraredLeftInsideFar +

				"Infrared middle: " + infraredMiddle + "]";
	}

}
