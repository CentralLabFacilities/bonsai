============
Memory Slots
============

Skills
------

Slots are used to store data for other skills/states to use.

Take a look at the SlotWriter and SlotReader skill:

.. code-block:: kotlin

    class SlotWriter : AbstractSkill() {

        private var tokenSuccess: ExitToken? = null
        private var slot: MemorySlotWriter<String>? = null

        override fun configure(configurator: ISkillConfigurator) {
            tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
            slot = configurator.getWriteSlot("StringToWriteTo", String::class.java)
        }

        override fun init(): Boolean {
            return true
        }

        override fun execute(): ExitToken {
            slot!!.memorize("Hello World")
            return tokenSuccess!!
        }

        override fun end(curToken: ExitToken): ExitToken {
            return curToken
        }

    }

.. code-block:: kotlin

    class SlotReader : AbstractSkill() {

        private var tokenSuccess: ExitToken? = null
        private var slot: MemorySlot<String>? = null

        private var read: String? = ""

        override fun configure(configurator: ISkillConfigurator) {
            tokenSuccess = configurator.requestExitToken(ExitStatus.SUCCESS())
            slot = configurator.getReadSlot<String>("StringIAmReading", String::class.java)
        }

        override fun init(): Boolean {
            read = slot!!.recall<String>() ?: return false
            return true
        }

        override fun execute(): ExitToken {
            logger.info("current data: $read")
            return tokenSuccess!!
        }

        override fun end(curToken: ExitToken): ExitToken {
            return curToken
        }

    }

Both want to access a slot which stores strings. 
The SlotWriter requests access to the slot with the key "StringToWriteTo" in which he wants to write The string "Hello World":

.. code-block:: kotlin

    slot = configurator.getWriteSlot("StringToWriteTo", String::class.java)

    // ... some other code ...

    override fun execute(): ExitToken {
        slot!!.memorize("Hello World")
        return tokenSuccess!!
    }


The SlotReader on the other hand requests a slot to read a string from. 
The read data is then simply printed:

.. code-block:: kotlin

    slot = configurator.getReadSlot<String>("StringIAmReading", String::class.java)

    // ... some other code ...

    override fun init(): Boolean {
        read = slot!!.recall<String>() ?: return false
        return true
    }

    override fun execute(): ExitToken {
        logger.info("current data: $read")
        return tokenSuccess!!
    }

State Machine
-------------

Now that we have the skills to read and write, we need to integrate them into our state machine.
The skills require slots with the keys "StringToWriteTo" and "StringIAmReading". 
We have to assign a path for the slots in the state machine. 
The paths should be the same, so that the writer writes "hello World" and the reader then reads the same string.
The path for the slots have to be defined in the datamodel. The data id needs to be "#_SLOTS".
There, we can define the path for each slot key.

.. code-block:: xml

    <datamodel>
        <data id="#_STATE_PREFIX" expr="'de.unibi.citec.clf.bonsai.skills.'"/>
        <!-- slots are used to store data for other skills/states to use -->
        <!-- we have to define the path for each used slot -->
        <data id="#_SLOTS">
            <slots>
                <slot key="StringToWriteTo" state="example.SlotWriter" xpath="/path"/>
                <slot key="StringIAmReading" state="example.SlotReader" xpath="/path"/>
            </slots>
        </data>
    </datamodel>

.. warning:: 
    Keep in mind that the slot key in the datamodel of the state machine needs to be the same as in the skill!

With the keys being setup correctly, the slot writer will write the string to the /path path and the reader will read from it.