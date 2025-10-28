
.. _section_data_types:

Data Types
==========

In order to remain detached from the robotic hardware and middleware, Bonsai implements various data types, such as PersonData, Points, or Poses. 
You can find them in the ``bonsai_interfaces`` package. 

.. _section_adapter:

Adapter
~~~~~~~
Using adapters, the data from the robotic hardware and middleware can be cast to Bonsai specific types.
Bonsai already provides the ``bonsai_adapter_ros`` package, which transforms ROS messages to Bonsai data types.

For example, the ROS message *geometry_msgs/Point* is being cast to the Bonsai class ``Point3D`` using the ``Point3dSerializer`` class. 
The Bonsai skills will never know about ROS messages and only use the Bonsai Point3D data types.