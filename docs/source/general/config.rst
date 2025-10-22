
.. _section_config:

Bonsai Configuration
====================

In order for Bonsai to know which sensor and actuator to use, we need to define them in a configuration file.
The configuration file can look like the following:



.. code-block:: xml

    <?xml version="1.0" encoding="utf-8"?>
    <BonsaiConfiguration xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                        xsi:noNamespaceSchemaLocation="BonsaiConfiguration.xsd">

        <!-- FACTORY CLASSES -->
        <FactoryOptions factoryClass="de.unibi.citec.clf.bonsai.ros.RosFactory" >
            <Option key="NODE_INIT_TIMEOUT">5000</Option>
            <Option key="INIT_SLEEP_TIME">500</Option>
        </FactoryOptions>

        <FactoryOptions factoryClass="de.unibi.citec.clf.bonsai.memory.MemoryFactory" />

        <!-- COORDINATE TRANSFORMATION CLASS -->
        <CoordinateTransformer factoryClass="de.unibi.citec.clf.bonsai.ros.RosFactory"
                            coordinateTransformerClass="de.unibi.citec.clf.bonsai.ros.TFTransformer"
        />

        <!-- MEMORY -->
        <WorkingMemory key="WorkingMemory"
                    factoryClass="de.unibi.citec.clf.bonsai.memory.MemoryFactory"
                    workingMemoryClass="de.unibi.citec.clf.bonsai.memory.DefaultMemory">
        </WorkingMemory>

        <!-- SENSORS -->
        <Sensors src="default/DefaultSensors.xml" />

        <Sensor key="PersonSensor"
            factoryClass="de.unibi.citec.clf.bonsai.ros.RosFactory"
            sensorClass="de.unibi.citec.clf.bonsai.ros.sensors.RosBtlMsgSensor"
            wireTypeClass="people_msgs.People"
            dataTypeClass="de.unibi.citec.clf.btl.data.person.PersonDataList">
            <Options>
                <Option key="topic">/people_tracker/people</Option>
            </Options>
        </Sensor>

        <!-- ACTUATORS -->
        <Actuators src="default/DefaultActuators.xml" />

        <Actuator key="NavigationActuator" 
              factoryClass="de.unibi.citec.clf.bonsai.ros.RosFactory"
              actuatorClass="de.unibi.citec.clf.bonsai.ros.actuators.ClfMoveBaseNavigationActuator"
              actuatorInterface="de.unibi.citec.clf.bonsai.actuators.NavigationActuator">
            <Options>
                <Option key="topic">/move_base</Option>
                <Option key="moveRelativeTopic">/key_vel</Option>
                <Option key="costmapTopic">/move_base/clear_costmaps</Option>
                <Option key="makePlanTopic">/move_base/GlobalPlanner/make_plan</Option>
            </Options>
        </Actuator>
    </BonsaiConfiguration>


The first line defines the XML version and encoding of the configuration file.
The **BonsaiConfiguration** contains all the configurations Bonsai needs. the XML schema is implemented in the *BonsaiConfiguration.xsd* file.

.. note:: 
    
    When you started Bonsai and you want to load your robotic behavior, you also need to provide your Bonsai config file

.. code-block:: xml

    <?xml version="1.0" encoding="utf-8"?>
    <BonsaiConfiguration xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                        xsi:noNamespaceSchemaLocation="BonsaiConfiguration.xsd">
        ...
    </BonsaiConfiguration>

.. _section_config_factory:
    
Factory Class Config
--------------------

:ref:`Factory classes <section_factory_class>` can be used to configure Sensors, Actuators, and the internal memory.
The factory class checks if the sensor and actuator configuration is correct and configures the sensors and actuators. 
Each factory class that is being used needs to be configured in the Bonsai configuration using the ``FactoryOptions`` tag.

The MemoryFactory is used to create :ref:`Memory Slots <section_memory>`.
Additionally, Bonsai implements Adapter classes for ROS and a factory class for ROS based actuators and sensors.
The RosFactory will check if a ros master node has been started.
It starts ROS nodes for each sensor, actuator, and coordinate transform and creates the respective Bonsai interface for skills to use.
it needs additional options such as timeout or initial sleep time, which can be provided with the `Option` tag.


.. code-block:: xml

    <!-- FACTORY CLASSES -->
    <FactoryOptions factoryClass="de.unibi.citec.clf.bonsai.memory.MemoryFactory" />

    <FactoryOptions factoryClass="de.unibi.citec.clf.bonsai.ros.RosFactory" >
        <Option key="NODE_INIT_TIMEOUT">5000</Option>
        <Option key="INIT_SLEEP_TIME">500</Option>
    </FactoryOptions>

Actuator and Sensor Config
--------------------------

Actuators and sensors are configured in the *Actuator* and *Sensor* tag respectively.
Additionally, more configurations can be sourced with the *Actuators* and *Sensors* tag

.. code-block:: xml

    <!-- SOURCE ACTUATORS FROM ANOTHER FILE -->
    <Actuators src="default/DefaultActuators.xml" />

     <!-- SOURCE SENSORS FROM ANOTHER FILE -->
    <Sensors src="default/DefaultSensors.xml" />       

Single Actuator and Sensor tags can require multiple options. These options can be described here and then gathered in the Actuator/Sensor implementation.

Sensor Configuration
~~~~~~~~~~~~~~~~~~~~

The example above configures the PersonSensor which is a RosNode that publishes people messages to the topic */people_tracker/people*.

.. code-block:: xml

    <Sensor key="PersonSensor"
        factoryClass="de.unibi.citec.clf.bonsai.ros.RosFactory"
        sensorClass="de.unibi.citec.clf.bonsai.ros.sensors.RosBtlMsgSensor"
        wireTypeClass="people_msgs.People"
        dataTypeClass="de.unibi.citec.clf.btl.data.person.PersonDataList">
        <Options>
            <Option key="topic">/people_tracker/people</Option>
        </Options>
    </Sensor>

.. list-table:: 
   :widths: 15 15
   :header-rows: 1

   * - Tags
     - Explanation
   * - ``factoryClass``
     - | The :ref:`factory class <section_factory_class>` creates an instance of the sensor class we want.
       | The RosFactory class makes sure a ros master node has been started
   * - ``sensorClass``
     - | This tag is for setting the sensor class
       | get Actuators and Sensors with them and request
       | parameters and memory slots defined in the **SCXML**
   * - ``wireTypeClass``
     - | This specifies the data type of the sensor. In this case we have a
       | ROS node which publishes people_msgs.People
   * - ``dataTypeClass``    
     - | Since we want to detach the skills and robotic behavior from the
       | actual sensors, we cast the people_msgs.People into a data type
       | available in Bonsai such as the PersonDataList

.. note:: 

    The :ref:`adapting ROS specific data types to Bonsai data types <section_adapter>` is implemented in the **bonsai_adapter_ros** package

As ``Option`` we provide the topic where the people_msgs.People are being published to.


Actuator Configuration
~~~~~~~~~~~~~~~~~~~~~~~

Let's take a look at the NavigationActuator example here:

.. code-block:: xml

    <Actuator key="NavigationActuator" 
              factoryClass="de.unibi.citec.clf.bonsai.ros.RosFactory"
              actuatorInterface="de.unibi.citec.clf.bonsai.actuators.NavigationActuator"
              actuatorClass="de.unibi.citec.clf.bonsai.ros.actuators.ClfMoveBaseNavigationActuator">
        <Options>
            <Option key="topic">/move_base</Option>
            <Option key="moveRelativeTopic">/key_vel</Option>
            <Option key="costmapTopic">/move_base/clear_costmaps</Option>
            <Option key="makePlanTopic">/move_base/GlobalPlanner/make_plan</Option>
        </Options>
    </Actuator>

The NavigationActuator is an Actuator based on ROS. 
The RosFactory will setup and configure the Actuator.
The Interface class is the `NavigationActuator` interface. 
The actual implementation of the actuator is `ClfMoveBaseNavigationActuator`.

.. list-table:: 
   :widths: 15 15
   :header-rows: 1

   * - Tags
     - Explanation
   * - ``factoryClass``
     - | The :ref:`factory class <section_factory_class>` creates an instance of the actuator class we want.
       | The RosFactory class makes sure a ros master node has been started
   * - ``actuatorInterface``
     - | The :ref:`Interface <section_interface>` is needed for detaching Skills 
       | from the robot hardware and middleware components. 
   * - ``actuatorClass``
     - | The actual implementation of the actuator

The NavigationActuator required several topics in order move the robot around.
The topics can be configured under the ``Options`` tag. 

In the actual implementation of the Actuator (here it is `ClfMoveBaseNavigationActuator`) the options can be gathered from the configurations using the keys,
e.g. key "topic" to get the */move_base* topic.

A skill in Bonsai can access the Actuator and Sensors defined in the configuration by referring to the key defined in the *Actuator* or *Sensor* tag

.. code-block:: xml

    <Actuator key="NavigationActuator" ... >
        ...
    </Actuator>


Bonsai configurator
-------------------

The configuration from the Bonsai config are passed to the Actuators, Sensors, and Skills via their configure() method.

.. code-block:: java

    void configure(Configurator) {...}

.. note::

    Configure is called during loading the robot behavior, therefore errors can be handled before execution.

There exist two types of configurators:

.. list-table:: 
   :widths: 15 15
   :header-rows: 1

   * - Configurator
     - Explanation
   * - ``ObjectConfigurator``
     - | They are provided to **Actuators** and **Sensors** and 
       | they get their configurations from the **Bonsai** 
       | **configuration** file
   * - ``SkillConfigurator``
     - | They are provided to the **skills**. The skill can 
       | get Actuators and Sensors with them and request
       | parameters and memory slots defined in the **SCXML**

