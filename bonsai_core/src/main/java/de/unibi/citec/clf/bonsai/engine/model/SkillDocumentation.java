package de.unibi.citec.clf.bonsai.engine.model;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Runtime representation of the documentation belonging to a skill class.
 *
 * <p>The value is injected into compiled skill classes during the Maven build
 * by the Bonsai Dokka plugin.</p>
 */
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.TYPE)
public @interface SkillDocumentation {

    String value();
}
