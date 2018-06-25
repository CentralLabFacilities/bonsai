package de.unibi.citec.clf.bonsai.core.object;

import de.unibi.citec.clf.bonsai.core.exception.TransformException;
import de.unibi.citec.clf.btl.Transform;





public interface TransformLookup {
    
    Transform lookup(String from, String to, long time) throws TransformException;
}
