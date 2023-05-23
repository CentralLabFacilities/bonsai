package de.unibi.citec.clf.bonsai.actuators.deprecated;



import de.unibi.citec.clf.bonsai.core.object.Actuator;
import de.unibi.citec.clf.btl.List;
import de.unibi.citec.clf.btl.data.geometry.Point2D;
import de.unibi.citec.clf.btl.data.knowledgebase.*;
import de.unibi.citec.clf.btl.data.map.Viewpoint;
import de.unibi.citec.clf.btl.data.person.PersonData;


/**
 * New interface to interact with a KnowledgeBase
 * 
 * @author ffriese
 * @author rfeldhans
 */
@Deprecated
public interface KBaseActuator extends Actuator {

    /*
        #### Where
        Will return a Viewpoint corresponding to a given identifier. 'Where' queries shall be of the form
        'where *unique_identifier* [*viewpoint_label*]'. The *unique identifier* can be of either a
        Location, Person, Room or RCObject. The optional *viewpoint label* can be specified to retrieve a
        specific viewpoint a Room or Location may have by its label. If *viewpoint label* is not specified,
        the Viewpoint with label 'main' will be used.
     */

    Viewpoint getViewpoint(String uniqueId) throws BDONotFoundException, NoAreaFoundException;
    Viewpoint getViewpoint(String uniqueId, String viewpoint_label) throws BDONotFoundException, NoAreaFoundException;

    /*
        #### What
        Will return a RCObject (or String). 'What' queries shall be of the form 'what [*attribute_name*]
        *unique_identifier*'. The *unique identifier* shall be the 'name' of a RCObject. The optional
        *attribute name* can be specified to retrieve (instead of the complete RCObject) the value of a
        specific attribute of the RCObject specified by the *unique identifier* as a String.
    */


    RCObject getRCObjectByName(String name) throws BDONotFoundException;
    String getRCObjectAttribute(String objectName, String attribute_name)
            throws BDONotFoundException;

    /*
        #### Which
        Will return a List of basic database objects (BDO, i.e. Person, Location, Room, Door, RCObject)
        where a given attribute has a given value. 'Which' queries shall be of the form 'which *BDO*
        *attribute* *value*'. The *BDO* must be either 'Location', 'Person', 'Room' or 'RCObject'. The
        *attribute* must be one of the attributes the *BDO* has. The *value* shall be the value of the
        given *attribute*.
     */

    <T extends BDO> List<T> getBDOByAttribute(Class<T> type,
                                              String attribute, String value)
            throws BDONotFoundException;

    <T extends BDO> List<T> getBDOByName(Class<T> type,
                                              String name)
            throws BDONotFoundException;

    /*
        #### Who
        will return a Person corresponding to a given identifier. 'Who' queries shall be of the form 'who
        *unique_identifier*. The *unique identifier* shall be the 'name' of a Person.
     */

    PersonData getPersonByName(String name) throws BDONotFoundException;


    /*
        #### In which
        Will return either a Location or a Room. 'In which' queries shall be of the form 'in which
        ('Location' | 'Room') *unique_identifier*'. The *unique identifier* can be of either a
        Location, Person, Room or RCObject. The second argument so to say must be either 'Location' or
        'Room' and will determine, if this query returns a Location or Room.
     */

    Location getLocationForBDO(String objectId) throws BDONotFoundException, NoAreaFoundException;
    Room getRoomForBDO(String objectName) throws BDONotFoundException, NoAreaFoundException;


    Room getRoomForPoint(Point2D point) throws BDONotFoundException, NoAreaFoundException;
    Location getLocationForPoint(Point2D point) throws BDONotFoundException, NoAreaFoundException;

    /*
        #### How many
        Will return a int corresponding to the number of distinct occurrences a specified attribute has
        in a BDO. 'How many' queries shall be of the form 'how many *attribute* *BDO*'. The
        *BDO* must be either 'Location', 'Person', 'Room' or 'RCObject'. The
        *attribute* must be one of the attributes the *BDO* has.
     */

    <T extends BDO> int getNumberOfDistinctAttributes(Class<T> type, String attribute);
    //int getNumberOf(String type, String attribute);


    /*
        #### Get
        With get you can retrieve a non basic data object. 'Get' queries shall be of the form 'get *NBDO*'.
        The *NBDO* must be either 'KBase', 'Arena', 'Context', 'RCObjects' or 'Crowd'.
     */

    KBase getKBase();
    Arena getArena();
    RCObjects getAllObjects();
    Crowd getCrowd();

    /*
     * ### Remember
     * Will save a BDO in the KBase. 'Remember' commands shall be of the form 'remember BDO'.
     * The BDO must be either a Location, Person, Room or Rcobject in XML-form.
     * To see how the BDOs shall be represented, take a look at the *_cleaned.xml in the
     * useful files folder or uncomment the lines at the end of the generate_example_data.py
     * to print a complete KBase in xml format.
     * (Note: The Generator and Timestamp elements are optional and required for downwards compatibility)
     */

    <T extends BDO> boolean storeBDO(T object) throws BDOHasInvalidAttributesException;

    /*
     * ### Forget
     * Will delete a BDO from the KBase. 'Forget' commands shall be of the form 'forget unique_identifier'.
     * The unique identifier can be of either a Location, Person, Room or RCObject.
     * Another form, added for convieniance is 'forget all BDO'.
     * The BDO must be either 'Location', 'Person', 'Room', 'Door' or 'RCObject'
     * (Plurals are allowed as well). It deletes every BDO of the given type.
     */
     <T extends BDO> boolean deleteBDO(T object) throws BDONotFoundException;

    class BDONotFoundException extends Exception{
        private static final long serialVersionUID = 6566180752668134724L;

        public BDONotFoundException(String error_text) {
            super(error_text);
        }
    }

    class ImplementationException extends RuntimeException{

        private static final long serialVersionUID = -748988524959862952L;

        public ImplementationException(String error_text) {
            super(error_text);
        }
    }

    class IncorrectQueryException extends RuntimeException{

        private static final long serialVersionUID = 3933457450154114123L;

        public IncorrectQueryException(String error_text) {
            super(error_text);
        }
    }

    class NoAreaFoundException extends Exception{

        private static final long serialVersionUID = 5655093940289217426L;

        public NoAreaFoundException(String error_text) {
            super(error_text);
        }
    }

    class BDOHasInvalidAttributesException extends Exception{

        private static final long serialVersionUID = -6278834801744184891L;

        public BDOHasInvalidAttributesException(String error_text) {
            super(error_text);
        }
    }



}
