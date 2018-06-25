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
public class PointCloudGraspingList extends List<PointCloudGrasping> {

	
	/**
	 * Constructor.
	 */
	public PointCloudGraspingList() {
		super(PointCloudGrasping.class);
	}

}
