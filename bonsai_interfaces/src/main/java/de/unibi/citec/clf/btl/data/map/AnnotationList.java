package de.unibi.citec.clf.btl.data.map;



import de.unibi.citec.clf.btl.List;


/**
 * This is only for convenience because BonSAI does not supper {@link List} type
 * so far.
 *
 * @author lkettenb
 */
@Deprecated
public class AnnotationList extends List<Annotation> {

    /**
     * Constructor.
     */
    public AnnotationList() {
        super(Annotation.class);
    }

}
