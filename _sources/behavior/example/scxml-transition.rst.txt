===========
Transitions
===========

Exit Tokens
-----------

A skill can return several statuses. The main ones are success, fatal and error.

Take a look at the following example skill:

.. code-block:: kotlin

    package de.unibi.citec.clf.bonsai.skills.example

    import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
    import de.unibi.citec.clf.bonsai.engine.model.ExitStatus
    import de.unibi.citec.clf.bonsai.engine.model.ExitToken
    import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
    import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException

    /**
    * This skill only succeeds
    */
    class Succeeder : AbstractSkill() {
        private var tokenSuccess: ExitToken? = null

        @Throws(SkillConfigurationException::class)
        override fun configure(configurator: ISkillConfigurator) {
            tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
            configurator.requestExitToken(ExitStatus.ERROR().ps("never"))
            configurator.requestExitToken(ExitStatus.ERROR().ps("neverEver"))
        }

        override fun init(): Boolean {
            // returning false here makes the skill FATAL
            return true
        }

        override fun execute(): ExitToken {
            // we always return success
            return tokenSuccess!!
        }

        override fun end(curToken: ExitToken): ExitToken {
            return curToken
        }
    }

Each skill can only return Exit tokens The FATAL and LOOP tokens can be used directly. 
In order to use Success and Error tokens, they have to be requested first:

.. code-block:: kotlin

    tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())

If you want several tokens or return more information, you can register Exit tokens with a processing status:

.. code-block:: kotlin

    configurator.requestExitToken(ExitStatus.ERROR().ps("never"))
    configurator.requestExitToken(ExitStatus.ERROR().ps("neverEver"))

.. warning::
    You should not use an exit token without a processing status when you already defined the token with a processing status.
    In this example, you should not use the ExitStatus.ERROR() token without a processing status, since we already defined the Error tokens with ps "never" and "neverEver".

Depending on the skill, other process statuses can be returned which then need to be considered in the state machine.

This can be easily done by adding the processing status in the event:

.. code-block:: xml

    <state id="example.Succeeder">
        <transition event="Succeeder.success" target="End"/>
        <transition event="Succeeder.fatal" target="Fatal"/>
        <transition event="Succeeder.error.never" target="Fatal"/>
        <transition event="Succeeder.error.*" target="Fatal"/>
    </state>

As can be seen above, the Error token with ps "never" is explicitly considered. 
The other error transitions are catched with the ``<transition event="Succeeder.error.*" target="Fatal"/>``

.. warning::
    It is important that the transition ``<transition event="Succeeder.error.*" target="Fatal"/>`` comes at last, as we do not want the "Succeeder.error.never" event to be catched by it as well.

Verification
------------

If we forget some events bonsai will remind us after loading. 
For example, if we would not include the error transitions above, you would then see errors looking something like this:

::

    State with id "de.unibi.citec.clf.bonsai.skills.example.Succeeder" misses transition for event "Succeeder.error.neverEver"
    State with id "de.unibi.citec.clf.bonsai.skills.example.Succeeder" misses transition for event "Succeeder.error.never"