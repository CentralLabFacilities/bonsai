package de.unibi.citec.clf.bonsai.core.configuration.data;

import java.util.Map;

/**
 * Basic configuration result returned by configuration parsers.
 *
 * @author jwienke
 */
public abstract class CoreObjectData {

    public String id;
    public Map<String, String> params;
    public String factory;

}
