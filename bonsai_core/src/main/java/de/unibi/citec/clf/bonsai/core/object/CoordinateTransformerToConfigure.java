package de.unibi.citec.clf.bonsai.core.object;

import java.util.Map;

/**
 * Class encapsulating an coordinate transformer to configure.
 *
 * @author lziegler
 */
public class CoordinateTransformerToConfigure {

    private Class<? extends TransformLookup> transformerClass;
    private Map<String, String> transformerOptions;

    public Class<? extends TransformLookup> getTransformerClass() {
        return transformerClass;
    }

    public void setTransformerClass(Class<? extends TransformLookup> transformerClass) {
        this.transformerClass = transformerClass;
    }

    public Map<String, String> getTransformerOptions() {
        return transformerOptions;
    }

    public void setTransformerOptions(Map<String, String> transformerOptions) {
        this.transformerOptions = transformerOptions;
    }

    /**
     * {@inheritDoc}
     */
    @Override
    public String toString() {
        return "CoordinateTransformerToConfigure [transformerClass=" + transformerClass + ", Options=" + transformerOptions + "]";
    }

}
