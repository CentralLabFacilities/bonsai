package de.unibi.citec.clf.bonsai.sensors.data;



import java.awt.Transparency;
import java.awt.color.ColorSpace;
import java.awt.image.BufferedImage;
import java.awt.image.ColorModel;
import java.awt.image.ComponentColorModel;
import java.awt.image.DataBufferByte;
import java.awt.image.WritableRaster;
import java.nio.ByteBuffer;
import javax.swing.ImageIcon;

/**
 * This class is used to hold the information about an image received by the
 * camera sensor. It contains width, height, pixel organization, and so on plus
 * helper functions to convert it to various representations. This is basically
 * used to give the user the more-or-less raw image data and provide a means to
 * get it in the desired container.
 * 
 * @author Ingo Luetkebohle <iluetkeb@techfak.uni-bielefeld.de>
 */
public class ImageData {

    private final int width;
    private final int height;
    private final int nplanes;
    private final int numPixels;
    private final String uri;
    private final byte[] pixelData;
    private final int offset;
    private final PlaneType ptype;

    private static final ColorModel CM;

    static {
        CM = new ComponentColorModel(ColorSpace.getInstance(ColorSpace.CS_sRGB), false, false, Transparency.OPAQUE,
                DataBufferByte.TYPE_BYTE);
    }

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
    public ImageData(int width, int height, String uri, byte[] pixelData, int offset, PlaneType ptype) {
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
     * Return the number of bytes used for the described image.
     * 
     * @return number of bytes
     */
    public final int getTotalBytes() {
        return numPixels;
    }

    /**
     * Return the number of bytes in plane n.
     * 
     * @param planeNo
     *            plane index
     * @return number of bytes
     */
    public final int getPlaneNumBytes(int planeNo) {
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
    public BufferedImage createBufferedImage() {
        if (numPixels + offset != pixelData.length) {
            throw new IllegalArgumentException("Expected " + (numPixels + offset) + " bytes but got "
                    + pixelData.length);
        }

        DataBufferByte db = new DataBufferByte(pixelData, numPixels, offset);
        int[] bankIndices = new int[nplanes];
        int[] bandOffsets = new int[nplanes];
        for (int i = 0; i < nplanes; i++) {
            bankIndices[i] = 0;
            bandOffsets[i] = i * width * height;
        }
        return new BufferedImage(CM, WritableRaster.createBandedRaster(db, width, height, width, bankIndices,
                bandOffsets, null), false, null);
    }

    /**
     * Return one buffer per plane. Re-uses the supplied buffer array, if
     * possible. Note: The array <i>will</i> contain new buffers after this
     * method returns, even if the the array itself is still the same.
     * 
     * @param suppliedBuf
     *            buffer to reuse
     * @return byte buffer
     */
    public ByteBuffer[] createBuffer(ByteBuffer[] suppliedBuf) {
        ByteBuffer[] result;
        int numPP = getPlaneNumBytes(0);

        if (suppliedBuf == null || suppliedBuf.length != nplanes || suppliedBuf[0] == null
                || suppliedBuf[0].capacity() < numPP) {
            result = new ByteBuffer[nplanes];
        } else {
            result = suppliedBuf;
        }

        ByteBuffer fullBuf = ByteBuffer.wrap(pixelData);
        int pos = offset;
        for (int i = 0; i < nplanes; ++i) {
            fullBuf.position(pos);
            pos += getPlaneNumBytes(i);
            result[i] = fullBuf.slice();
        }

        return result;
    }

    /**
     * Returns the image as an imageicon. Useful for JPanels as imageicons can
     * be added directly.
     * 
     * @return image icon
     */
    public ImageIcon createImageIcon() {
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
    public boolean isCompatible(ImageData spec) {
        return width == spec.width && height == spec.height && ptype == spec.ptype && nplanes == spec.nplanes;

    }
}
