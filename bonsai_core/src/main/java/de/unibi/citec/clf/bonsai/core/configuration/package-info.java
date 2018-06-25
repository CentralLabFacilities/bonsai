/**
 * Contains interfaces and a default xml-based implementation to configure the
 * {@link de.unibi.airobots.bonsai.core.BonsaiManager}.
 * 
 * <p>
 * {@link de.unibi.airobots.bonsai.core.configuration.ConfigurationParser}
 * defines the interface for classes that can be used to configure the
 * BonsaiManager. The basic idea is that configuration is provided external to
 * the source code. This is manifested by always providing a file to the
 * configuration objects. You can ignore this if you really know what you are
 * doing and want to lose configuration flexibility.
 * {@link de.unibi.airobots.bonsai.core.configuration.XmlConfigurationParser} is
 * the default provided configuration parser using an xml file for
 * configuration.
 * </p>
 */

package de.unibi.citec.clf.bonsai.core.configuration;


