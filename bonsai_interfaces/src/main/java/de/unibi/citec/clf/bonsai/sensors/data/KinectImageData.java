package de.unibi.citec.clf.bonsai.sensors.data;



import java.awt.Transparency;
import java.awt.color.ColorSpace;
import java.awt.image.BandedSampleModel;
import java.awt.image.BufferedImage;
import java.awt.image.ColorModel;
import java.awt.image.ComponentColorModel;
import java.awt.image.DataBuffer;
import java.awt.image.DataBufferByte;
import java.awt.image.DataBufferFloat;
import java.awt.image.DataBufferShort;
import java.awt.image.SampleModel;
import java.awt.image.WritableRaster;
import java.util.zip.DataFormatException;
import javax.swing.ImageIcon;

/**
 * This class is used to hold the information about an image received by the
 * Kinect sensor. It contains width, height, pixel organization, and so on plus
 * helper functions to convert it to various representations. This is basically
 * used to give the user the more-or-less raw image data and provide a means to
 * get it in the desired container.
 * TODO: this does not work right
 * @author vrichter
 */
public class KinectImageData {

    private final int width;
    private final int height;
    private final int nplanes;
    private final int numPixels;
    private final String uri;
    private final byte[] pixelData;
    private final int offset;
    private final PlaneType ptype;

    private short[] shortData = null;
    private float[] floatData = null;

    /**
     * Create a new spec for an image where all planes have the given width and
     * height.
     * 
     * @param width
     *            Width of a plane.
     * @param height
     *            Height of a plane.
     * @param uri
     *            pseudo-unique identifier of the image.
     * @param pixelData
     *            Data for the image.
     * @param offset
     *            Offset where the data starts in pixelData.
     * @param ptype
     *            How pixels are organized in pixelData.
     */
    public KinectImageData(int width, int height, String uri, byte[] pixelData,
            int offset, PlaneType ptype) {
        this.width = width;
        this.height = height;
        this.nplanes = PlaneType.getNumPlanes(ptype);
        this.uri = uri;
        this.pixelData = pixelData;
        this.offset = offset;
        this.ptype = ptype;
        numPixels = width * height * nplanes;
    }

    /**
     * Return (not really) unique identifier of image.
     * 
     * @return uri of the image
     */
    public final String getURI() {
        return uri;
    }

    /**
     * Return the number of elements used for the described image.
     * 
     * @return number of elements
     */
    public final int getTotalElements() {
        return numPixels;
    }

    /**
     * Return the number of elements in plane n.
     * 
     * @param planeNo
     *            plane index
     * @return number of elements
     */
    public final int getPlaneNumElements(int planeNo) {
        return getWidth(planeNo) * getHeight(planeNo);
    }

    /**
     * Returns width of plane n.
     * 
     * @param planeNo
     *            plane index
     * @return width
     */
    public final int getWidth(int planeNo) {
        return width;
    }

    /**
     * Returns height of plane n.
     * 
     * @param planeNo
     *            plane index
     * @return plane height
     */
    public final int getHeight(int planeNo) {
        return height;
    }

    /**
     * Returns number of planes.
     * 
     * @return number of planes
     */
    public final int getNumPlanes() {
        return nplanes;
    }

    /**
     * Returns a buffered image.
     * 
     * @return buffered image
     */
    public BufferedImage createBufferedImage() throws DataFormatException {
        DataBuffer db = getDataBuffer();
        ColorModel cm;
        WritableRaster wr;

        int[] bankIndices = new int[nplanes];
        int[] bandOffsets = new int[nplanes];
        for (int i = 0; i < nplanes; i++) {
            bankIndices[i] = 0;
            bandOffsets[i] = i * width * height;
        }

        if (ptype == PlaneType.GRAY16) {
            cm =
                    new ComponentColorModel(ColorSpace
                            .getInstance(ColorSpace.CS_GRAY), false, false,
                            Transparency.OPAQUE, DataBufferByte.TYPE_BYTE);
            SampleModel sm =
                    new BandedSampleModel(DataBuffer.TYPE_SHORT, width, height,
                            nplanes);
            wr = WritableRaster.createWritableRaster(sm, db, null);

        } else if (ptype == PlaneType.PLANAR_RGB32) {
            cm =
                    new ComponentColorModel(ColorSpace
                            .getInstance(ColorSpace.CS_sRGB), false, false,
                            Transparency.OPAQUE, DataBufferByte.TYPE_FLOAT);
            SampleModel sm =
                    new BandedSampleModel(DataBuffer.TYPE_FLOAT, width, height,
                            width, bankIndices, bandOffsets);

            wr = WritableRaster.createWritableRaster(sm, db, null);

        } else { //ordinary 8bit picture
            cm =
                    new ComponentColorModel(ColorSpace
                            .getInstance(ColorSpace.CS_sRGB), false, false,
                            Transparency.OPAQUE, DataBufferByte.TYPE_BYTE);

            wr =
                    WritableRaster.createBandedRaster(db, width, height, width,
                            bankIndices, bandOffsets, null);
        }
        return new BufferedImage(cm, wr, false, null);
    }

    /**
     * Creates a DataBuffer in the corresponding type. If the underlying
     * byte-array does not have the expected length it is most likely to throw
     * an IllegalArgumentException.
     * 
     * @param dataBufferType
     *            must be DataBuffer.TYPE_FLOAT, DataBuffer.TYPE_SHORT or
     *            DataBuffer.TYPE_BYTE
     * @return DataBuffer
     * @throws IllegalArgumentException
     *             when the properties of this ImageData does not suit the
     *             DataBufferType.
     */
    private DataBuffer getDataBuffer() throws DataFormatException {
        if (this.ptype == PlaneType.PLANAR_RGB32) {
            // Creating a DataBufferFloat for the Kinect 32bit-float Image.
            return new DataBufferFloat(getFloatData(), numPixels);
        } else if (this.ptype == PlaneType.GRAY16) {
            // Creating a DataBufferFloat for the KinectDepth 16bit Image.
            return new DataBufferShort(getShortData(), numPixels);
        } else {
            // Creating a DataBufferByte for the KinectDepth 8bit Image.
            return new DataBufferByte(getByteData(), numPixels, offset);
        }
    }

    /**
     * This Function creates a float[] from the byte[] that was passed in the
     * constructor of the Instance. It is assumed, that the byte-array contains
     * a float array encoded in IEEE754 floating-point "single format" bit
     * layout. Four bytes encode one Float:
     * 
     * [10110111] [01100010] [01010101] [00111111] ->
     * [10110111011000100101010100111111] -> -1.3490498E-5
     * 
     * @return a float-array parsed from the underlying byte-array.
     * @throws IllegalArgumentException
     *             when the byte-array does not have the expected size.
     */
    public float[] getFloatData() throws DataFormatException {
        if (this.floatData == null) {
            if ((numPixels * 4) + offset != pixelData.length) {
                throw new DataFormatException("Expected "
                        + ((numPixels * 4) + offset) + " bytes but got "
                        + pixelData.length);
            }
            float[] data = new float[numPixels];
            int pos = offset;
            for (int i = 0; i < numPixels; i++) {
                data[i] =
                        Float.intBitsToFloat(((pixelData[pos +3] & 0xff) << 24)
                                | ((pixelData[pos + 2] & 0xff) << 16)
                                | ((pixelData[pos + 1] & 0xff) << 8)
                                | ((pixelData[pos + 0] & 0xff)));
                pos += 4;
//                 System.err.println("1 "+Integer.toBinaryString((pixelData[pos]
//                 & 0xff)));
//                 System.err.println("1 "+Integer.toBinaryString((pixelData[pos]
//                 & 0xff) << 24));
//                 System.err.println("2 "+Integer.toBinaryString((pixelData[pos+1]
//                 & 0xff)));
//                 System.err.println("2 "+Integer.toBinaryString((pixelData[pos+1]
//                 & 0xff) << 16));
//                 System.err.println("3 "+Integer.toBinaryString((pixelData[pos+2]
//                 & 0xff)));
//                 System.err.println("3 "+Integer.toBinaryString((pixelData[pos+2]
//                 & 0xff) << 8));
//                 System.err.println("4 "+Integer.toBinaryString((pixelData[pos+3]
//                 & 0xff)));
//                 System.err.println("5 "+Integer.toBinaryString(((pixelData[pos]
//                 & 0xff) << 24)
//                 |((pixelData[pos + 1] & 0xff) << 16)
//                 |((pixelData[pos + 2] & 0xff) << 8)
//                 |((pixelData[pos + 3] & 0xff))));
//                 System.err.println("5 "+data[i]);
            }
            this.floatData = data;
        }
        return this.floatData;
    }

    /**
     * This Function creates a short[] from the byte[] that was passed in the
     * constructor of the Instance. It is assumed, that the byte-array contains
     * a short array. Two bytes are combined to one short.
     * 
     * [10110111][01100010] -> [10110111 01100010] -> -1.3490498E-5
     * 
     * @return a short-array parsed from the underlying byte-array.
     * @throws IllegalArgumentException
     *             when the byte-array does not have the expected size.
     */
    public short[] getShortData() throws DataFormatException {
        System.err
                .println("["
                        + Integer.toBinaryString((pixelData[0] & 0xff << 8))
                        + "]["
                        + Integer.toBinaryString((pixelData[1] & 0xff))
                        + "]->["
                        + Integer
                                .toBinaryString(((pixelData[0] & 0xff << 8) | (pixelData[1] & 0xff))));
        System.err.println("Int: "
                + ((pixelData[0] & 0xff << 8) | (pixelData[1] & 0xff)));
        System.err.println("short: "
                + (short) ((pixelData[0] & 0xff << 8) | (pixelData[1] & 0xff)));
        if (this.shortData == null) {
            if ((numPixels * 2) + offset != pixelData.length) {
                throw new DataFormatException("Expected "
                        + ((numPixels * 2) + offset) + " bytes but got "
                        + pixelData.length);
            }
            short[] data = new short[numPixels];
            int pos = offset;
            for (int i = 0; i < numPixels; i++) {
                data[i] =
                        (short) ((pixelData[pos] & 0xff << 8) | (pixelData[pos + 1] & 0xff));
                pos += 2;
            }
            this.shortData = data;
        }
        return this.shortData;
    }

    /**
     * Checks whether the underlying byte-array has the expected size and
     * returns it. this array may contain the initial offset.
     * 
     * @return the byte array
     * @throws IllegalArgumentException
     */
    public byte[] getByteData() throws DataFormatException {
        if (numPixels + offset != pixelData.length) {
            throw new DataFormatException("Expected " + (numPixels + offset)
                    + " bytes but got " + pixelData.length);
        }
        return pixelData;
    }

    /**
     * Returns the image as an imageicon. Useful for JPanels as imageicons can
     * be added directly.
     * 
     * @return image icon
     */
    public ImageIcon createImageIcon() throws DataFormatException {
        return new ImageIcon(createBufferedImage());
    }

    /**
     * Returns layout of the image.
     * 
     * @return image layout
     */
    public PlaneType getImageLayout() {
        return ptype;
    }

    /**
     * Returns if the image is suitable for the given specs.
     * 
     * @param spec
     *            spec to test image for
     * @return <code>true</code> if image is compatible
     */
    public boolean isCompatible(KinectImageData spec) {
        return width == spec.width && height == spec.height
                && ptype == spec.ptype && nplanes == spec.nplanes;

    }
}
