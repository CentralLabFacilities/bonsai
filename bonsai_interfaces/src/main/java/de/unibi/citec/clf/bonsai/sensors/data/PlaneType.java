package de.unibi.citec.clf.bonsai.sensors.data;

/**
 * The PlaneType of the image used by ImageData class.
 * 
 * @author Ingo Luetkebohle <iluetkeb@techfak.uni-bielefeld.de>
 * @author vrichter
 */
public enum PlaneType {

    UNKNOWN_RAW8, GRAY8, GRAY16, PLANAR_RGB8, PLANAR_RGB32, PLANAR_YUV8, INTERLEAVED_RGB8;

    private static final int[] GL_1L = new int[] { 6409 };
    private static final int[] GL_3L = new int[] { 6409, 6409, 6409 };
    private static final int[] GL_1RGB = new int[] { 6407 };

    public static int[] getGLPlaneTypes(PlaneType type) {
        switch (type) {
            case UNKNOWN_RAW8:
            case GRAY8:
            case GRAY16:
                return GL_1L;
            case PLANAR_RGB8:
            case PLANAR_RGB32:
            case PLANAR_YUV8:
                return GL_3L;
            case INTERLEAVED_RGB8:
                return GL_1RGB;
            default:
                return GL_1L;
        }
    }

    public static int getNumPlanes(PlaneType type) {
        return getGLPlaneTypes(type).length;
    }
}
