.. |image0| image:: /_static/img/slots.png
.. _section_memory:

Memory Slots
============

The slots is used to memorize data for different skills.
A slot has a ``key`` which uniquely identifies the slot within the skill in use.

:ref:`Skills <section_skills>` define the data type of the slot and can read and write data into it.

.. note:: 

    Data already stored in a slot will be overwriten once another skill writes data into it.


A skill can request slots from the :ref:`Skill Configurator <section_skill_configurator>`. 
The configurator tries to find the slot definition inside the :ref:`robot behavior control (SCXML) <section_scxml>` with the ``key`` and ``state`` and configures the slot with the corresponding ``xpath``.

.. note:: 

    The slot keys are only unique within the skill itself.
    Other skills can have slots with the same ID. 
    The :ref:`robot behavior control <section_scxml>` needs to make sure to correctly :ref:`configure the slots <section_memory_scxml>`.

Slot Types
----------

There are three different kind of slots:

.. list-table:: Slot Types
   :widths: 15 15
   :header-rows: 1

   * - Slot Type
     - Explanation
   * - ReadSlot
     - Used to only read from a slot
   * - WriteSlot
     - Used to write into a slot
   * - ReadWriteSlot
     - Used to read and write from and into a slot

Usage
-----

Memory slots are created using the :ref:`MemoryFactory class <section_factory_class>`.
This will create instances of ``ObjectSlots`` which inherit from the ``MemorySlot`` interface (both implemented in the ``bonsai_core`` repository).

Slot have several functions that you can use:

.. list-table:: Slot Functions
   :widths: 15 15
   :header-rows: 1

   * - Function
     - Explanation
   * - ``recall()``
     - Used to read from the slot (which allows reading)
   * - ``memorize()``
     - Used to write to a slot (if allowed to write)
   * - ``forget()``
     - Removes the data from the slot

Within a skill, using the :ref:`SkillConfigurator <section_skill_configurator>` the skill can request slots from which it can read or write from.
The skill can define the key used to reference the slot. The slot location for the skill is defined within in the :ref:`SCXML <section_scxml>`.

Example
.......

In this example we want to:

- Read from a slot containing an int
- Write a String to a slot
- Read and Write data of the type ``Type`` from a slot

.. code-block:: java

    public class ExampleSkill implements AbstractSkill {

         // define here the keys of everything we want to get from the configurator
         private KEY_CLASS_SLOT = "ClassSlot";
         private KEY_INT_SLOT = "IntSlot";
         private KEY_STRING_SLOT = "StringSlot";

         // Declare the Actuators, Sensors, Slots and parameters
         private Slot<String> stringSlot;
         private Slot<int> intSlot;
         private Slot<Type> classSlot;

         private String stringData = "example";
         private int intData;
         private Type classData;

        /*
        * This function uses the Skillconfigurator to get the configured objects and initialize everything
        * that has been declared above
        */
        @Override
        public void configure(ISkillConfigurator conf) {
            this.intSlot = conf.getReadSlot(KEY_INT_SLOT)           // read slot
            this.stringSlot = conf.getWriteSlot(KEY_STRING_SLOT);   // write slot
            this.classSlot = conf.getReadWriteSlot(KEY_CLASS_SLOT); // read and write slot
        }

        /*
         * This function will return the ExitToken Fatal when the slots are null
         */
        @Override
        public boolean init(){
            // Check if slots have been configured
            if (this.intSlot == null || this.stringSlot == null || this.classSlot == null) 
                return false

            // read from a ReadSlot
            this.intData = this.intSlot.recall();
            // read from the ReadWriteSlot
            this.classData = this.classSlot.recall();            
        }

        @Override
        public ExitToken execute() {
            // write to the WriteSlot
            this.stringSlot.write(this.stringData);
            // write to the ReadWriteSlot
            this.classData.doSomeChanges();
            this.classSlot.write(this.classData);
        }

        ...

    }

.. note:: 

    The skill defines by which key (SlotID) it wants to request its slot. 
    Other parameters need to define slots are provided using the :ref:`robotic behavior control <section_memory_scxml>`.

