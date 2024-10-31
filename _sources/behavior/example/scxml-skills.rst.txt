==============================================
Integrate Bonsai Skills into the State Machine
==============================================

One Skill
---------

Let's take a look at a Bonsai skill which we want to integrate into our state machine:

.. code-block:: kotlin

    package de.unibi.citec.clf.bonsai.skills.example

    import de.unibi.citec.clf.bonsai.engine.model.AbstractSkill
    import de.unibi.citec.clf.bonsai.engine.model.ExitToken
    import de.unibi.citec.clf.bonsai.engine.model.config.ISkillConfigurator
    import de.unibi.citec.clf.bonsai.engine.model.config.SkillConfigurationException

    /**
    * This skill does nothing
    */
    class Nothing : AbstractSkill() {
        @Throws(SkillConfigurationException::class)
        override fun configure(configurator: ISkillConfigurator) {
            // In configure we can setup the skill
            // This is executed during LOAD for verification and again before the skill gets executed
        }

        override fun init(): Boolean {
            // Init the executed first
            // we can only succeed or fail the initialisation
            // if we return false the skill is stopped and exists with `FATAL`
            return true
        }

        override fun execute(): ExitToken {
            // In execute the main work of the skill should happen
            // By returning `ExitToken.loop` execute gets called again thus creating a loop
            return ExitToken.fatal()
        }

        override fun end(curToken: ExitToken): ExitToken {
            // end is called after execute finishes with a non Loop status
            // the returned token is the final status of the skill
            return curToken
        }
    }


This skill is in the ``de.unibi.citec.clf.bonsai.skills.example`` package. 
The file is named ``Nothing.kt``. Each Bonsai Skill needs to inherit from the ``AbstractSkill`` class.

Now, how to we integrate this skill into our state machine? The following example shows how:

.. code-block:: xml

    <?xml version="1.0" encoding="UTF-8"?>
    <scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="Nothing">
        <datamodel>
            <data id="#_STATE_PREFIX" expr="'de.unibi.citec.clf.bonsai.skills.example.'"/>
        </datamodel>

        <state id="Nothing">
            <transition event="Nothing.fatal" target="End"/>
        </state>

        <state id="End" final="true"/>

    </scxml>


The state machine begins with the state with the id "Nothing" by setting ``initial="Nothing``:
::

    ``<scxml xmlns="http://www.w3.org/2005/07/scxml" version="1.0" initial="Nothing">``

In order for the state machine to find the Nothing skill in the ``de.unibi.citec.clf.bonsai.skills.example`` package we have to setup the ``#_STATE_PREFIX`` (Mind the full stop/period at the end of the prefix):

.. code-block:: xml

    <datamodel>
        <data id="#_STATE_PREFIX" expr="'de.unibi.citec.clf.bonsai.skills.example.'"/>
    </datamodel>

The state machine then tries to find the skill "#_STATE_PREFIX.id".
The id here is set to 'Nothing'. Thus, this state uses the de.unibi.citec.clf.bonsai.skills.example.Nothing class.

.. code-block:: xml

    <state id="Nothing">
        <transition event="Nothing.fatal" target="End"/>
    </state>

    <state id="End" final="true"/>

After the skill finishes its exit status gets send as event `id.event`.  
Here the target is End, which is a final state, thus, ending the behavior.

The state machine will go to the Nothing skill and execute it. 
Since the Nothing skill only returns the Fatal exit token, we transition on the Nothing.fatal event to the End state.

Using the same skill multiple times
-----------------------------------

The state id are unique to each state. So what do we do when we want to use a skill multiple times?
For this case, we can add a hashtag some text following it, which will be ignored in the search for the class.

Following the example above, we can thus add a second state as follows:

.. code-block:: xml

    <state id="Nothing">
        <!-- The transition only uses the skill name -->
        <transition event="Nothing.fatal" target="Nothing#2"/>
    </state>

    <!-- This results in unique state ids we can refer to -->
    <state id="Nothing#2">
        <transition event="Nothing.fatal" target="End"/>
    </state>

The transition event only uses the skill name. 
To refer to the skill, use the whole unique id with the hashtag as done in the transition block of the "Nothing" state. 