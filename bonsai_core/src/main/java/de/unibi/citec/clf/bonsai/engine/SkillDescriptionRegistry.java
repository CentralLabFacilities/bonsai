package de.unibi.citec.clf.bonsai.engine;

import org.apache.log4j.Logger;

import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Enumeration;
import java.util.Properties;

public final class SkillDescriptionRegistry {

    private static final String RESOURCE =
            "META-INF/bonsai/skill-descriptions.properties";

    private static final Properties descriptions =
            loadDescriptions();

    private SkillDescriptionRegistry() {
    }

    public static String getDescription(Class<?> skillClass) {
        return descriptions.getProperty(
                skillClass.getName(),
                ""
        );
    }

    private static Properties loadDescriptions() {

        Properties result = new Properties();

        try {
            ClassLoader classLoader =
                    Thread.currentThread()
                            .getContextClassLoader();

            Enumeration<URL> resources =
                    classLoader.getResources(RESOURCE);

            while (resources.hasMoreElements()) {

                URL resource = resources.nextElement();

                try (
                        InputStream input =
                                resource.openStream();

                        InputStreamReader reader =
                                new InputStreamReader(
                                        input,
                                        StandardCharsets.UTF_8
                                )
                ) {
                    Properties current =
                            new Properties();

                    current.load(reader);

                    result.putAll(current);
                }
            }

        } catch (Exception e) {
            // add warning
        }

        return result;
    }
}