package de.unibi.citec.clf.bonsai.engine.config

import de.unibi.citec.clf.bonsai.util.MapReader
import org.apache.log4j.Logger

class SkillStateMachineConfig {
    @JvmField
    var statePrefix = "de.unibi.citec.clf.bonsai.skills."
    @JvmField
    var useFullIdForStateInformer = true
    @JvmField
    var customFinalStates = true
    @JvmField
    var showDefaultSlotWarnings = true
    @JvmField
    var generateDefaultSlots = false
    @JvmField
    var enableSkillWarnings = true
    @JvmField
    var configureSkills = true
    @JvmField
    var hashSkillConfigurations = false
    @JvmField
    var sendAllPossibleTransitions = false
    
    @Throws(MapReader.KeyNotFound::class)
    fun configure(data: Map<String?, String?>?) {
        statePrefix = MapReader.readConfigString("#_STATE_PREFIX", statePrefix, data)
        logger.debug("Set state prefix to: $statePrefix")

        showDefaultSlotWarnings = !MapReader.readConfigBool(
            "#_DISABLE_DEFAULT_SLOT_WARNINGS",
            !showDefaultSlotWarnings, data
        )
        logger.debug("Set disable_default_slot_warnings to: " + !showDefaultSlotWarnings)

        enableSkillWarnings = MapReader.readConfigBool("#_ENABLE_SKILL_WARNINGS", enableSkillWarnings, data)
        logger.debug("Enable Skill warnings: $enableSkillWarnings")

        generateDefaultSlots = MapReader.readConfigBool("#_GENERATE_DEFAULT_SLOTS", generateDefaultSlots, data)
        logger.debug("Set generation of default slots to: $generateDefaultSlots")

        configureSkills = MapReader.readConfigBool("#_CONFIGURE_AND_VALIDATE", configureSkills, data)
        logger.debug("Enable full configuration and validation: $configureSkills")

        hashSkillConfigurations = MapReader.readConfigBool("#_ENABLE_CONFIG_CACHE", hashSkillConfigurations, data)
        logger.debug("Enable configuration cache: $hashSkillConfigurations")

        customFinalStates = MapReader.readConfigBool("#_FINAL_STATES", customFinalStates, data)
        logger.debug("Using End and Fatal as final states")

        sendAllPossibleTransitions =
            MapReader.readConfigBool("#_SEND_ALL_TRANSITIONS", sendAllPossibleTransitions, data)
        logger.debug("Send all Taransitions: $sendAllPossibleTransitions")
    }

    companion object {
        private val logger = Logger.getLogger(SkillStateMachineConfig::class.java)
    }
}
