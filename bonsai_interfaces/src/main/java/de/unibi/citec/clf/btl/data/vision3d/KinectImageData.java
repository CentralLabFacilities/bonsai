package de.unibi.citec.clf.btl.data.vision3d;



import de.unibi.citec.clf.btl.Type;


/**
 * Representation for the image metadata format used by Kinectserver.
 * 
 * @author vrichter
 */
public class KinectImageData extends Type {

	public enum ImageType {
		RGB, DEPTH, REALDEPTH
	}

	protected String uri;
	protected int width;
	protected int height;
	protected String colorspace;
	protected int channels;
	protected String depth;
	protected int subsampling;
	protected ImageType type;

	/**
	 * Cosntructor.
	 */
	public KinectImageData() {
	}

	public ImageType getType() {
		return this.type;
	}

	public int getWidth() {
		return width;
	}

	public void setWidth(int width) {
		this.width = width;
	}

	public String getUri() {
		return uri;
	}

	public int getHeight() {
		return height;
	}

	public String getColorspace() {
		return colorspace;
	}

	public void setUri(String uri) {
		this.uri = uri;
	}

	public void setHeight(int height) {
		this.height = height;
	}

	public void setColorspace(String colorspace) {
		this.colorspace = colorspace;
	}

	public void setChannels(int channels) {
		this.channels = channels;
	}

	public int getChannels() {
		return channels;
	}

	public void setDepth(String depth) {
		this.depth = depth;
	}

	public String getDepth() {
		return depth;
	}

	public void setSubsampling(int subsampling) {
		this.subsampling = subsampling;
	}

	public int getSubsampling() {
		return subsampling;
	}
}
