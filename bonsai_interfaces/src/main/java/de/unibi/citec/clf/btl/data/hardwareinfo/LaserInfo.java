package de.unibi.citec.clf.btl.data.hardwareinfo;



import java.util.HashMap;
import java.util.Map;
import de.unibi.citec.clf.btl.units.AngleUnit;
import de.unibi.citec.clf.btl.units.UnitConverter;


public class LaserInfo {

	/**
	 * An enum containing the known laser scanner models.
	 */
	public enum ScannerModel {
		SICK_LMS200, HOKUYO_UBG_04LX_F01, MERGED_LASER2014
	}

	/**
	 * A {@link HashMap} containing the ranges of each camera model. The values
	 * are ranges as degree values.
	 */
	private static final Map<ScannerModel, LaserInfo> info = new HashMap<ScannerModel, LaserInfo>() {
		private static final long serialVersionUID = -1139374584227504395L;
		{
			put(ScannerModel.SICK_LMS200, new LaserInfo(180, // angle range
					361, // number of scans
					4)); // max distance
			put(ScannerModel.HOKUYO_UBG_04LX_F01, new LaserInfo(270, // angle
																		// range
					541, // number of scans
					4)); // max distance
                        put(ScannerModel.MERGED_LASER2014, new LaserInfo(360, // angle
																		// range
					720, // number of scans
					8)); // max distance
		}
	};

	public static class OutOfRangeException extends Exception {
		private static final long serialVersionUID = 6678346277276506877L;

		public OutOfRangeException(String message) {
			super(message);
		}
	}

	/**
	 * Getter for the information about the given laser scanner model.
	 * 
	 * @param model
	 *            The laser scanner model to receive information for.
	 * @return {@link LaserInfo} instance, that describes the scanner.
	 */
	public static LaserInfo getInfo(ScannerModel model) {
		return info.get(model);
	}

    // public static double degreeToRadiant(double angle) {
	// return angle * Math.PI / 180.0;
	// }

    // public static double radiantToDegree(double angle) {
	// return angle * 180.0 / Math.PI;
	// }

	/**
	 * Calculates the index of the scan value corresponding to the given angle.
	 * 
	 * @param scannerModel
	 *            Identity of the used laser scanner.
	 * @param angle
	 *            The angle of the requested value. [radiant]
	 * @return The index of the laser scan corresponding to the given angle.
	 * @throws OutOfRangeException
	 *             Is thrown if the given angle is not in the range of the laser
	 *             scanner.
	 */
	public static int calcScanIndex(ScannerModel scannerModel, double angle)
			throws OutOfRangeException {

		return calcScanIndex(info.get(scannerModel).getRange(AngleUnit.RADIAN),
				info.get(scannerModel).getNumScans(), angle);
	}

	/**
	 * Calculates the index of the scan value corresponding to the given angle.
	 * 
	 * @param range
	 *            Complete angle range of the scanner. [radian]
	 * @param numScans
	 *            Number scans of the scanner.
	 * @param angle
	 *            The angle of the requested value. [radiant]
	 * @return The index of the laser scan corresponding to the given angle.
	 * @throws OutOfRangeException
	 *             Is thrown if the given angle is not in the range of the laser
	 *             scanner.
	 */
	public static int calcScanIndex(double range, int numScans, double angle)
			throws OutOfRangeException {

		// range of the laser scanner
		double rangeRad = range;
		double rangeHalf = rangeRad / 2.0;

		// Convert target angle to scanner's scale
		double target = angle + rangeHalf;
		if (target < 0 || target > rangeRad) {
			throw new OutOfRangeException(
					"requested angle is out of laser range!");
		}

		// width of each scan
		double binWidth = rangeRad / (double) (numScans - 1);

		// calculate the requested scan and round it
		long targetScan = Math.round(target / binWidth);

		return (int) targetScan;
	}

	private double range;
	private double maxDistance;
	private int numScans;
	private AngleUnit iAU = AngleUnit.DEGREE;

	public LaserInfo(double range, int numScans, double maxDistance) {
		this.range = range;
		this.maxDistance = maxDistance;
		this.numScans = numScans;
	}

	public double getRange(AngleUnit aU) {
		return UnitConverter.convert(range, iAU, aU);
	}

	public double getMaxDistance() {
		return maxDistance;
	}

	public int getNumScans() {
		return numScans;
	}
}
