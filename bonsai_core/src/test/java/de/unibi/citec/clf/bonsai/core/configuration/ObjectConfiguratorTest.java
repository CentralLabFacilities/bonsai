package de.unibi.citec.clf.bonsai.core.configuration;

import de.unibi.citec.clf.bonsai.core.exception.ConfigurationException;
import de.unibi.citec.clf.bonsai.core.exception.MissingKeyConfigurationException;
import de.unibi.citec.clf.bonsai.core.exception.ParameterCastConfigurationException;
import java.util.HashMap;
import java.util.Map;
import org.junit.Test;
import static org.junit.Assert.*;

/**
 *
 * @author lruegeme
 */
public class ObjectConfiguratorTest {
    
    public ObjectConfiguratorTest() {
    }

    @Test
    public void testMissingParameter() {
        
        ObjectConfigurator conf = ObjectConfigurator.createConfigPhase();
        
        int integer = conf.requestInt("INTEGER");
        String string = conf.requestValue("STRING");
        
        Map<String, String> params = new HashMap<>();
        params.put("INTEGER", "8");
       
        try {
            conf.activateObjectPhase(params);
            fail("configuration should fail");
        } catch (ConfigurationException ex) {
            
        }
        assertEquals(1, conf.getExceptions().size());
        
        MissingKeyConfigurationException ex;
        ex = (MissingKeyConfigurationException) conf.getExceptions().get(0);
        MissingKeyConfigurationException expected = new MissingKeyConfigurationException("STRING", String.class);
        assertEquals(ex.getKey(), expected.getKey());
        assertEquals(ex.getC(), expected.getC());
    }
    
    @Test
    public void testOptionalParameter() {
        
        ObjectConfigurator conf = ObjectConfigurator.createConfigPhase();
        
        int integer = conf.requestInt("INTEGER");
        double opt_double = conf.requestOptionalDouble("OPT_DOUBLE", 2.0);
        boolean opt_bool = conf.requestOptionalBool("OPT_BOOL", false);
        
        Map<String, String> params = new HashMap<>();
        params.put("INTEGER", "8");
        params.put("OPT_BOOL","false");
        
        try {
            conf.activateObjectPhase(params);
        } catch (ConfigurationException ex) {
            fail("configuration should not fail");
        }
        
        assertEquals(1, conf.getUnusedOptionalParams().size());
        Class dbl = conf.getUnusedOptionalParams().getOrDefault("OPT_DOUBLE", String.class);
        assertEquals(Double.class, dbl);
    }
    
    @Test
    public void testFetchParameter() {
        
        ObjectConfigurator conf = ObjectConfigurator.createConfigPhase();
        
        int integer = conf.requestInt("INTEGER");
        double opt_double = conf.requestOptionalDouble("OPT_DOUBLE", 2.0);
        boolean opt_bool = conf.requestOptionalBool("OPT_BOOL", false);
        
        Map<String, String> params = new HashMap<>();
        params.put("INTEGER", "8");
        params.put("OPT_BOOL","true");
        
        try {
            conf.activateObjectPhase(params);
        } catch (ConfigurationException ex) {
            fail("configuration should not fail");
        }
        
        integer = conf.requestInt("INTEGER");
        opt_double = conf.requestOptionalDouble("OPT_DOUBLE", 2.0);
        opt_bool = conf.requestOptionalBool("OPT_BOOL", false);
        
        assertEquals(8, integer);
        assertEquals(2.0, opt_double, 0.0);
        assertEquals(true, opt_bool);
    }
    
    @Test
    public void testWrongParameter() {
        
        ObjectConfigurator conf = ObjectConfigurator.createConfigPhase();
        
        int integer = conf.requestInt("INTEGER");
        
        Map<String, String> params = new HashMap<>();
        params.put("INTEGER", "hello");
       
        try {
            conf.activateObjectPhase(params);
            fail("configuration should fail");
        } catch (ConfigurationException ex) {
            
        }
        assertEquals(1, conf.getExceptions().size());
        ParameterCastConfigurationException ex;
        ex = (ParameterCastConfigurationException) conf.getExceptions().get(0);
        ParameterCastConfigurationException expected = 
                new ParameterCastConfigurationException("INTEGER", Integer.class, "hello");
        assertEquals(ex.getKey(), expected.getKey());
        assertEquals(ex.getType(), expected.getType());
        assertEquals(ex.getValue(), expected.getValue());
    }
    
}
