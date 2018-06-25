package de.unibi.citec.clf.btl.data.vision2d;

import de.unibi.citec.clf.btl.Type;

public class CameraAttributes extends Type {

    private double fovH;
    private double fovV;

    public double getFovH() {
        return fovH;
    }

    public void setFovH(double fovH) {
        this.fovH = fovH;
    }

    public double getFovV() {
        return fovV;
    }

    public void setFovV(double fovV) {
        this.fovV = fovV;
    }

    @Override
    public String toString(){
        return "CameraAttributes: FoVH: " + fovH + "; FoVV: " + fovV;
    }
}
