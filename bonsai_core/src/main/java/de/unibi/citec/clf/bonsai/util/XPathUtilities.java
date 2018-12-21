package de.unibi.citec.clf.bonsai.util;


import nu.xom.Document;
import nu.xom.Element;
import nu.xom.Nodes;

import java.util.StringTokenizer;

public class XPathUtilities {

    public static Document addParentXPath(Document t, String xPath) {

        StringTokenizer x = new StringTokenizer(xPath, "/");
        if (!x.hasMoreElements()) {
            return t;
        }
        Element currParent = null;
        Element root = null;
        Element childElement;
        while (x.hasMoreTokens()) {
            String nodeName = x.nextToken();
            childElement = new Element(nodeName);
            if (root == null) {
                root = childElement;
            } else {
                currParent.appendChild(childElement);
            }
            currParent = childElement;
        }

        if (currParent != null) {
            currParent.appendChild(new Element(t.getRootElement()));
        }
        return new Document(root);
    }

    /**
     * Removes xpath prefix from document. Returns null if prefix has no children!
     *
     * @param t     The document to shorten
     * @param xPath The prefix xpath to remove
     * @return The shortened document or null if the prefix has no children.
     */
    public static Document removeParentXPath(Document t, String xPath) {

        Document retDoc = t;

        if (!xPath.equals("") && !xPath.equals("/")) {
            if (!xPath.startsWith("/")) {
                xPath = "/" + xPath;
            }
            Nodes nodes = t.query(xPath);
            if (nodes.size() > 0 && nodes.get(0).getChildCount() > 0) {
                Element newRoot = (Element) nodes.get(0).getChild(nodes.get(0).getChildCount() - 1).copy();
                retDoc = new Document(newRoot);
            } else if (nodes.size() > 0 && nodes.get(0).getChildCount() == 0) {
                retDoc = null;
            }
        }
        return retDoc;
    }
}
