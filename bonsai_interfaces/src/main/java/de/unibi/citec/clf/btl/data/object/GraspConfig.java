
package de.unibi.citec.clf.btl.data.object;



import de.unibi.citec.clf.btl.Type;

/**
 *
 * @author johannes
 */
public class GraspConfig extends Type {
    private String groupName;
    private String configName;

    /**
     * @return the groupName
     */
    public String getGroupName() {
        return groupName;
    }

    /**
     * @param groupName the groupName to set
     */
    public void setGroupName(String groupName) {
        this.groupName = groupName;
    }

    /**
     * @return the configName
     */
    public String getConfigName() {
        return configName;
    }

    /**
     * @param configName the configName to set
     */
    public void setConfigName(String configName) {
        this.configName = configName;
    }
}
