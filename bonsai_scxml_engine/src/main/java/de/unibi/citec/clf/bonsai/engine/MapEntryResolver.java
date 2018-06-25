/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */
package de.unibi.citec.clf.bonsai.engine;

import org.apache.log4j.Logger;

import javax.xml.transform.Source;
import javax.xml.transform.TransformerException;
import javax.xml.transform.URIResolver;
import javax.xml.transform.stream.StreamSource;
import java.io.StringReader;
import java.util.HashMap;
import java.util.Map;

/**
 * @author lruegeme
 */
class MapEntryResolver implements URIResolver {

    private Map<String, String> map = new HashMap<>();

    private static final String PREFIX = "map://";

    private final Logger logger = Logger.getLogger(getClass());

    @Override
    public Source resolve(String href, String base) throws TransformerException {
        Source snippet = null;

        if (!href.startsWith(PREFIX)) return snippet;

        String key = href.replace(PREFIX, "");

        if (map.containsKey(key)) {
            snippet = new StreamSource(new StringReader("<" + key + ">" + map.get(key) + "</" + key + ">"));
        } else {
            logger.fatal("path mapping for '" + key + "' is unknown" + "\n" +
                    " please set mapping with the -m TEST=/path option");
            throw new TransformerException("mapping for '" + key + "' is unknown");
        }

        return snippet;
    }

    public void setMap(Map<String, String> map) {
        this.map = map;
    }

}
