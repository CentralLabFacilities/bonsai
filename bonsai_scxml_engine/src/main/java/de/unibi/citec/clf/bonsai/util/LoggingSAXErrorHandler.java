/*
 * To change this license header, choose License Headers in Project Properties.
 * To change this template file, choose Tools | Templates
 * and open the template in the editor.
 */
package de.unibi.citec.clf.bonsai.util;

import org.apache.log4j.Logger;
import org.xml.sax.ErrorHandler;
import org.xml.sax.SAXParseException;

/**
 * @author lruegeme
 */
public class LoggingSAXErrorHandler implements ErrorHandler {

    private final Logger logger;

    public LoggingSAXErrorHandler(Logger log) {
        logger = log;
    }

    @Override
    public void warning(SAXParseException e) {
        logger.warn(e.getMessage());
    }

    @Override
    public void fatalError(SAXParseException e) {
        logger.fatal(e.getMessage());
    }

    @Override
    public void error(SAXParseException e) {
        logger.error(e.getMessage());
    }

}
