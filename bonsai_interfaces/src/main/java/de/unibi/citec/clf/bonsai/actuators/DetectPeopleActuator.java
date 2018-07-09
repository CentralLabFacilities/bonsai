
package de.unibi.citec.clf.bonsai.actuators;

import de.unibi.citec.clf.bonsai.core.object.Actuator;
import java.util.List;
import de.unibi.citec.clf.btl.data.person.PersonDataList;

import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;

/**
 *
 * @author pvonneumanncosel
 */
public interface DetectPeopleActuator extends Actuator{

    Future<PersonDataList> getPeople() throws InterruptedException, ExecutionException;

    Future<PersonDataList> getPeople(boolean do_gender_and_age, boolean do_face_id) throws InterruptedException, ExecutionException;

    Future<PersonDataList> getPeople(boolean do_gender_and_age, boolean do_face_id, float resize_out_ratio) throws InterruptedException, ExecutionException;

    Future<List<Integer>> getFollowROI() throws InterruptedException, ExecutionException;
}
