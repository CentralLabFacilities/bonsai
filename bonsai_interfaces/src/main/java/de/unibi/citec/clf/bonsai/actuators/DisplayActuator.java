package de.unibi.citec.clf.bonsai.actuators;

import de.unibi.citec.clf.bonsai.core.object.Actuator;

import java.util.List;
import java.util.Map;


/**
 * Interface for actuator that controls a Display
 * 
 * @author ffriese
 */
public interface DisplayActuator extends Actuator {

    void setWindowText(String txt);

    void displayChoice(String layout,
                       String caption,
                       Byte caption_mode,
                       List<String> choices,
                       Map<String, String> choice_captions,
                       Map<String, String> choice_submit_texts,
                       Map<String, Byte> choice_types,
                       Map<String, List<String>> choice_group_names,
                       Map<String, List<String>> choice_group_items,
                       Map<String, String> templates);
}
