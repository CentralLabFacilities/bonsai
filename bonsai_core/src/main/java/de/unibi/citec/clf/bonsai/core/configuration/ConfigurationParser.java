package de.unibi.citec.clf.bonsai.core.configuration;



import de.unibi.citec.clf.bonsai.core.configuration.data.BonsaiConfigurationData;
import de.unibi.citec.clf.bonsai.core.exception.ParseException;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;

/**
 * Parser interface for Bonsai configuration files. The basic procedure is to
 * create an instance of a concrete parser, call the {@link #parseFile(URI)}
 * method on it and collect the results with the various getter methods. If the
 * parsing resulted in an error, this class is in an undefined state and results
 * cannot be used.
 * 
 * A parser instance must provide at least one
 * {@link ConfiguredCoreObjectFactory} describing a {@link CoreObjectFactory}
 * configuration. The described factory is used to create {@link Sensor} and
 * {@link Actuator} instances. Moreover two sets of {@link ConfiguredSensor}s
 * and {@link ConfiguredActuator}s need to be returned. All described
 * {@link Sensor}s and {@link Actuator}s in these sets must be constructible by
 * one of the factories described earlier. Further the instance may return one
 * or more {@link ConfiguredWorkingMemory} objects describing
 * {@link WorkingMemory} configurations that create {@link MemorySlot}s.
 * 
 * @author jwienke
 */
public interface ConfigurationParser {
    
    BonsaiConfigurationData getconfiguration();

    /**
     * Parses the content of the given stream as configurations. If an exception is
     * thrown, no configuration was parsed.
     * 
     * @param configurationStream
     *            stream containing the configuration
     * @throws IOException
     *             error opening the file for parsing
     * @throws ParseException
     *             error parsing the file
     * @throws IllegalStateException
     *             if parsing was already invoked
     */
    void parse(InputStream configurationStream) throws IOException, ParseException, IllegalStateException;
    
    /**
     * Parses the file under the given url as configurations. If an exception is
     * thrown, no configuration was parsed.
     * 
     * @param configurationUrl
     *            url of the configuration
     * @throws IOException
     *             error opening the file for parsing
     * @throws ParseException
     *             error parsing the file
     * @throws IllegalStateException
     *             if parsing was already invoked
     */
    void parse(URI configurationUrl) throws IOException, ParseException, IllegalStateException;

    /**
     * Parses the file under the given url as configurations. If an exception is
     * thrown, no configuration was parsed.
     * 
     * @param configurationUrl
     *            url of the configuration
     * @throws IOException
     *             error opening the file for parsing
     * @throws ParseException
     *             error parsing the file
     * @throws IllegalStateException
     *             if parsing was already invoked
     */
    void parse(String configurationUrl) throws IOException, ParseException, IllegalStateException;


}
