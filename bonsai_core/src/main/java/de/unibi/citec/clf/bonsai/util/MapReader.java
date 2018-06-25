package de.unibi.citec.clf.bonsai.util;



import java.util.Map;
import org.apache.log4j.Logger;


public class MapReader {
    
    private static Logger logger = Logger.getLogger(MapReader.class);
    
    public static class KeyNotFound extends Exception {
        private static final long serialVersionUID = -6717193549059273143L;
        public KeyNotFound(String m) {
            super(m);
        }
    }
    
    public static double readConfigDouble(String key, double defaultValue, Map<String, String> var) throws KeyNotFound {
        if (var.containsKey(key)) {
            try {
              return Double.parseDouble(var.get(key).replaceAll("'", ""));
            } catch (NumberFormatException ex) {
                if(var.get(key).replaceAll("'", "").startsWith("@")) {
                    logger.warn("key expr starts with @, assuming load");
                    return defaultValue;
                }
                throw new KeyNotFound("Your "+key+" variable contains invalid data, is "
                        + var.get(key).replaceAll("'", "")
                        + " and should be a double");
            }
        } else {
            return defaultValue;
        }
    }
    
    public static double readConfigDouble(String key, Map<String,String> var) throws KeyNotFound{
        if (!var.containsKey(key)) {
            throw new KeyNotFound("You have to set the "+key+" variable, it is requiered");
        }
        return readConfigDouble(key, Double.NaN, var);
    }
    
    public static String readConfigString(String key, String defaultValue, Map<String, String> var) {
        if (var.containsKey(key)){
            return var.get(key).replaceAll("'", "");
        } else {
            return defaultValue;
        }
    }
    
    public static String readConfigString(String key, Map<String, String> var) throws KeyNotFound {
        if (!var.containsKey(key)) {
            throw new KeyNotFound("You have to set the "+key+" variable, it is requiered");
        }
        return readConfigString(key,null,var);
    }
    
    public static boolean readConfigBool(String key, Map<String, String> var ) throws KeyNotFound {
        if (!var.containsKey(key)) {
            throw new KeyNotFound("You have to set the "+key+" variable, it is requiered");
        }
        return readConfigBool(key,false,var);
    }

    public static boolean readConfigBool(String key, boolean defaultValue, Map<String, String> var) throws KeyNotFound  {
        if (var.containsKey(key)) {
            String b = var.get(key);
            b = b.replaceAll("'", "");
            if(b.equalsIgnoreCase("true") || b.equalsIgnoreCase("false")) {
                return Boolean.parseBoolean(var.get(key).replaceAll("'", ""));  
            } else {
                if(var.get(key).replaceAll("'", "").startsWith("@")) {
                    logger.warn("key expr starts with @, assuming load");
                    return defaultValue;
                }
                throw new KeyNotFound("Your "+key+" variable contains invalid data, is "
                        + var.get(key).replaceAll("'", "")
                        + " and should be a boolean (true or false)");
            }
        } else {
            return defaultValue;
        }       
    }
    
    public static int readConfigInteger(String key, int defaultValue, Map<String, String> var) throws KeyNotFound {
        if (var.containsKey(key)) {
            try {
              return Integer.parseInt(var.get(key).replaceAll("'", ""));
            } catch (NumberFormatException ex) {
                if(var.get(key).replaceAll("'", "").startsWith("@")) {
                    logger.warn("key expr starts with @, assuming load");
                    return defaultValue;
                }
                throw new KeyNotFound("Your "+key+" variable contains invalid data, is "
                        + var.get(key).replaceAll("'", "")
                        + " and should be a Integer");
            }
        } else {
            return defaultValue;
        }
    }
    
    public static int readConfigInteger(String key, Map<String,String> var) throws KeyNotFound{
        if (!var.containsKey(key)) {
            throw new KeyNotFound("You have to set the "+key+" variable, it is requiered");
        }
        return readConfigInteger(key, 0, var);
    }
    
    public static long readConfigLong(String key, long defaultValue, Map<String, String> var) throws KeyNotFound {
        if (var.containsKey(key)) {
            try {
              return Long.parseLong(var.get(key).replaceAll("'", ""));
            } catch (NumberFormatException ex) {
                if(var.get(key).replaceAll("'", "").startsWith("@")) {
                    logger.warn("key expr starts with @, assuming load");
                    return defaultValue;
                }
                throw new KeyNotFound("Your "+key+" variable contains invalid data, is "
                        + var.get(key).replaceAll("'", "")
                        + " and should be a Long");
            }
        } else {
            return defaultValue;
        }
    }
    
    public static long readConfigLong(String key, Map<String,String> var) throws KeyNotFound{
        if (!var.containsKey(key)) {
            throw new KeyNotFound("You have to set the "+key+" variable, it is requiered");
        }
        return readConfigInteger(key, 0, var);
    }
    
    
}
