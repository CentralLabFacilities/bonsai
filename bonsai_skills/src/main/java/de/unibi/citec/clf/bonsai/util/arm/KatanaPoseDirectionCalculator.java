package de.unibi.citec.clf.bonsai.util.arm;



import de.unibi.citec.clf.btl.data.grasp.KatanaPoseData;
import de.unibi.citec.clf.btl.units.LengthUnit;
import java.util.Vector;

public class KatanaPoseDirectionCalculator {

    public static Vector<Double> calcluateDirection(KatanaPoseData startPose,
            KatanaPoseData targetPose) {
        Vector<Double> ret = new Vector<Double>();

        double destX = targetPose.getX(LengthUnit.MILLIMETER) - startPose.getX(LengthUnit.MILLIMETER);
        double destY = targetPose.getY(LengthUnit.MILLIMETER) - startPose.getY(LengthUnit.MILLIMETER);
        double destZ = targetPose.getZ(LengthUnit.MILLIMETER) - startPose.getZ(LengthUnit.MILLIMETER);

        double length =
                Math.sqrt(Math.pow(destX, 2) + Math.pow(destY, 2)
                        + Math.pow(destZ, 2));

        ret.add(destX / length);
        ret.add(destY / length);
        ret.add(destZ / length);

        return ret;
    }
}
