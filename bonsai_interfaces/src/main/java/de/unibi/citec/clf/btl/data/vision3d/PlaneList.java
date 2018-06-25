package de.unibi.citec.clf.btl.data.vision3d;



import de.unibi.citec.clf.btl.List;

/**
 * This is only for convenience because bonsai does not support the {@link List}
 * type so far.
 * 
 * @author lziegler
 */
//USE GENERIC BTL LIST
@Deprecated
public class PlaneList extends List<PlaneData> {

	
	/**
	 * Constructor.
	 */
	public PlaneList() {
		super(PlaneData.class);
	}

}
