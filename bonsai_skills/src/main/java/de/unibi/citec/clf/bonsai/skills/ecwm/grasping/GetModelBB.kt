package de.unibi.citec.clf.bonsai.skills.ecwm.grasping

import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
import de.unibi.citec.clf.bonsai.engine.model.ExitToken
import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
import de.unibi.citec.clf.bonsai.actuators.ECWMGrasping
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlot
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotReader
import de.unibi.citec.clf.bonsai.core.`object`.MemorySlotWriter
import de.unibi.citec.clf.btl.data.ecwm.Entity
import de.unibi.citec.clf.btl.data.ecwm.Model
import de.unibi.citec.clf.btl.data.geometry.BoundingBox3D

import java.util.concurrent.Future

/**
 * Attach an ECWM Entity to the gripper.
 *
 * <pre>
 *
 * Options:
 *  type:       [String] Optional
 *                  -> Type
 * Slots:
 *  Model:         [Model] Read
 *                      -> Model.typename when data not set
 *  BoundingBox:   [BoundingBox3D] Write
 *                      -> The Bounding Box
 *
 * ExitTokens:
 *  success:
 *
 *
 * Actuators:
 *  ECWMGrasping: [ECWMGrasping]
 *
 * </pre>
 *
 * @author lruegeme
 */
class GetModelBB : AbstractSkill() {

    private val KEY_TYPE = "type"
    private var type: String = "object/unknown"

    private var fur: Future<BoundingBox3D?>? = null
    private var ecwm: ECWMGrasping? = null
    private var tokenSuccess: ExitToken? = null

    private var slot: MemorySlotReader<Model>? = null
    private var boxSlot: MemorySlotWriter<BoundingBox3D>? = null
    override fun configure(configurator: ISkillConfigurator) {
        tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
        if(configurator.hasConfigurationKey(KEY_TYPE)) {
            type = configurator.requestValue(KEY_TYPE)
        } else {
            slot = configurator.getReadWriteSlot("Model", Model::class.java)
        }

        boxSlot = configurator.getWriteSlot("BoundingBox", BoundingBox3D::class.java)
        ecwm = configurator.getActuator("ECWMGrasping", ECWMGrasping::class.java)
    }

    override fun init(): Boolean {
        var model = slot?.recall<Model>() ?: Model(type)

        fur = ecwm?.getBoundingBox(model)

        return fur != null
    }

    override fun execute(): ExitToken {
        while (!fur!!.isDone) {
            return ExitToken.loop()
        }
        var box = fur!!.get();
        logger.debug(box)
        boxSlot!!.memorize(box!!)
        return tokenSuccess!!
    }

    override fun end(curToken: ExitToken): ExitToken {
        return curToken
    }
}
